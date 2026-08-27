import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { ImportAttendanceUseCase } from '../src/application/use-cases/import-attendance.use-case.js';
import { DispatchCampaignUseCase } from '../src/application/use-cases/dispatch-campaign.use-case.js';
import { ProcessInboundMessageUseCase } from '../src/application/use-cases/process-inbound-message.use-case.js';
import { MockWhatsAppProvider } from '../src/infrastructure/whatsapp/mock-whatsapp.provider.js';
import { CompositeAIService } from '../src/infrastructure/ai/composite-ai.service.js';
import { RuleBasedFallbackProvider } from '../src/infrastructure/ai/rule-based-fallback.provider.js';

describe('Suíte Completa de Validação de Cenários E2E (A a H)', () => {
  let mockWhatsApp: MockWhatsAppProvider;
  let compositeAI: CompositeAIService;
  let importUseCase: ImportAttendanceUseCase;
  let dispatchUseCase: DispatchCampaignUseCase;
  let inboundUseCase: ProcessInboundMessageUseCase;

  beforeAll(async () => {
    mockWhatsApp = MockWhatsAppProvider.getInstance();
    compositeAI = new CompositeAIService();
    importUseCase = new ImportAttendanceUseCase();
    dispatchUseCase = new DispatchCampaignUseCase(mockWhatsApp);
    inboundUseCase = new ProcessInboundMessageUseCase(compositeAI);

    // Limpa tabelas de teste
    await prisma.aIAnalysis.deleteMany();
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.attendance.deleteMany();
    await prisma.person.deleteMany();
    await prisma.event.deleteMany();
  });

  // =========================================================================
  // CENÁRIO A: 100 pessoas (70 presentes, 30 ausentes)
  // =========================================================================
  it('Cenário A: Deve importar e segmentar corretamente 100 contatos (70 presentes e 30 ausentes)', async () => {
    const event = await prisma.event.create({
      data: {
        name: 'Mega Evento Comunitário 2026',
        eventDate: new Date('2026-08-26T20:00:00Z'),
        location: 'Auditório Central'
      }
    });

    // Gera lista de 100 pessoas em memória
    const rows: any[] = [];
    for (let i = 1; i <= 100; i++) {
      const isPresent = i <= 70;
      const phoneDigits = String(10000000 + i).padStart(8, '0');
      rows.push({
        Nome: `Participante Teste ${i}`,
        Telefone: `(11) 9${phoneDigits}`,
        Evento: event.name,
        Participou: isPresent ? 'Sim' : 'Não'
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Presencas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const importResult = await importUseCase.execute({
      eventId: event.id,
      fileBuffer: buffer,
      filename: '100_participantes.xlsx'
    });

    expect(importResult.totalImported).toBe(100);
    expect(importResult.totalPresent).toBe(70);
    expect(importResult.totalAbsent).toBe(30);

    // Dispara campanha para os ausentes
    const campaignResult = await dispatchUseCase.execute({
      eventId: event.id,
      type: 'AUSENTE_FOLLOWUP',
      messageTemplate: 'Olá, {{nome}}! Sentimos sua falta no {{evento}}!'
    });

    expect(campaignResult.totalRecipients).toBe(30);
    expect(campaignResult.totalSent).toBe(30);
    expect(campaignResult.totalFailed).toBe(0);
  });

  // =========================================================================
  // CENÁRIO B: Pessoa duplicada
  // =========================================================================
  it('Cenário B: Deve tratar duplicidades de contatos sem duplicar registros ou corromper dados', async () => {
    const event = await prisma.event.create({
      data: {
        name: 'Culto de Quarta',
        eventDate: new Date()
      }
    });

    const rows = [
      { Nome: 'Pedro Silva', Telefone: '(11) 98888-1111', Participou: 'Não' },
      { Nome: 'Pedro Silva Santos', Telefone: '11 98888-1111', Participou: 'Sim' } // Mesma pessoa com nome mais completo
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Presencas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const importResult = await importUseCase.execute({
      eventId: event.id,
      fileBuffer: buffer
    });

    expect(importResult.totalImported).toBe(1);
    expect(importResult.duplicatesIgnored).toBe(1);
    expect(importResult.totalPresent).toBe(1);

    const person = await prisma.person.findUnique({
      where: { normalizedPhone: '+5511988881111' }
    });
    expect(person).toBeDefined();
    expect(person?.name).toBe('Pedro Silva');
  });

  // =========================================================================
  // CENÁRIO C: Telefone inválido
  // =========================================================================
  it('Cenário C: Deve identificar e isolar linhas com telefones inválidos sem abortar o lote', async () => {
    const event = await prisma.event.create({
      data: {
        name: 'Workshop de Liderança',
        eventDate: new Date()
      }
    });

    const rows = [
      { Nome: 'Contato Válido', Telefone: '(11) 99999-8888', Participou: 'Sim' },
      { Nome: 'Telefone Falso', Telefone: '12345', Participou: 'Não' },
      { Nome: 'DDD Inexistente', Telefone: '(00) 91111-2222', Participou: 'Não' }
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Presencas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const importResult = await importUseCase.execute({
      eventId: event.id,
      fileBuffer: buffer
    });

    expect(importResult.totalImported).toBe(1);
    expect(importResult.invalidRows.length).toBe(2);
    expect(importResult.invalidRows[0].error).toBeDefined();
  });

  // =========================================================================
  // CENÁRIO D: Pessoa responde justificativa clara
  // =========================================================================
  it('Cenário D: Deve classificar corretamente resposta com justificativa clara (SAUDE, TRABALHO, VIAGEM)', async () => {
    const resultSaude = await inboundUseCase.execute({
      fromPhone: '+5511977771234',
      text: 'Oi pastor! Tive febre muito alta e dor no corpo, precisei ir ao médico tomar remédio.'
    });

    expect(resultSaude.isOptOut).toBe(false);
    expect(resultSaude.classification?.category).toBe('SAUDE');
    expect(resultSaude.classification?.confidence).toBeGreaterThanOrEqual(0.70);
    expect(resultSaude.classification?.suggestedReply).toContain('recuperação');

    const resultTrabalho = await inboundUseCase.execute({
      fromPhone: '+5511977775678',
      text: 'Boa noite! Peguei escala de plantão extra na empresa e trabalhei até tarde.'
    });

    expect(resultTrabalho.classification?.category).toBe('TRABALHO');
    expect(resultTrabalho.classification?.requiresHumanAttention).toBe(false);
  });

  // =========================================================================
  // CENÁRIO E: Pessoa responde algo ambíguo
  // =========================================================================
  it('Cenário E: Deve classificar resposta ambígua/monossilábica como INCONCLUSIVO com confiança baixa', async () => {
    const result = await inboundUseCase.execute({
      fromPhone: '+5511977779999',
      text: '👍 ok'
    });

    expect(result.classification?.category).toBe('INCONCLUSIVO');
    expect(result.classification?.confidence).toBeLessThan(0.60);
  });

  // =========================================================================
  // CENÁRIO F: Pessoa pede contato humano / oração
  // =========================================================================
  it('Cenário F: Deve identificar pedido de atendimento/oração com requires_human_attention = true e urgência ALTA', async () => {
    const result = await inboundUseCase.execute({
      fromPhone: '+5511966665555',
      text: 'Pastor, estou passando por uma fase muito difícil de luto e depressão na minha família. Por favor orem por mim e preciso de ajuda.'
    });

    expect(result.classification?.category).toBe('PEDIDO_ATENDIMENTO');
    expect(result.classification?.requiresHumanAttention).toBe(true);
    expect(result.classification?.urgency).toBe('ALTA');
    expect(result.classification?.sentiment).toBe('PREOCUPADO');
  });

  // =========================================================================
  // CENÁRIO G: WhatsApp retorna erro
  // =========================================================================
  it('Cenário G: Deve tratar graciosa e resilientemente erro de entrega retornado pelo provedor WhatsApp', async () => {
    const event = await prisma.event.create({
      data: { name: 'Evento Teste Erro', eventDate: new Date() }
    });

    const person = await prisma.person.create({
      data: {
        name: 'Contato com Erro',
        phone: '11911112222',
        normalizedPhone: '+5511911112222',
        optOut: false
      }
    });

    await prisma.attendance.create({
      data: {
        personId: person.id,
        eventId: event.id,
        attended: false
      }
    });

    // Simula falha no provedor
    mockWhatsApp.setFailNextSend(true);

    const campaignResult = await dispatchUseCase.execute({
      eventId: event.id,
      type: 'AUSENTE_FOLLOWUP',
      messageTemplate: 'Olá {{nome}}!'
    });

    expect(campaignResult.totalFailed).toBe(1);
    expect(campaignResult.messages[0].status).toBe('FAILED');
    expect(campaignResult.messages[0].error).toContain('Simulação de erro na entrega');
  });

  // =========================================================================
  // CENÁRIO H: IA indisponível (Fallback Heurístico Local Ativo)
  // =========================================================================
  it('Cenário H: Deve utilizar o motor de Fallback Heurístico Local com sucesso caso a IA externa esteja offline', async () => {
    const fallbackEngine = new RuleBasedFallbackProvider();

    const analysis = await fallbackEngine.classifyAbsence(
      'Estou viajando fora da cidade de férias com minha família.',
      { personName: 'Felipe', eventName: 'Culto de Domingo' }
    );

    expect(analysis.category).toBe('VIAGEM');
    expect(analysis.providerUsed).toBe('RULE_BASED_FALLBACK');
    expect(analysis.suggested_reply).toContain('viagem');
    expect(analysis.requires_human_attention).toBe(false);
  });
});
