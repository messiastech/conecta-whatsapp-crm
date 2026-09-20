import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';
import * as XLSX from 'xlsx';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { ImportAttendanceUseCase } from '../src/application/use-cases/import-attendance.use-case.js';
import { DispatchCampaignUseCase } from '../src/application/use-cases/dispatch-campaign.use-case.js';
import { ProcessInboundMessageUseCase } from '../src/application/use-cases/process-inbound-message.use-case.js';
import { MockWhatsAppProvider } from '../src/infrastructure/whatsapp/mock-whatsapp.provider.js';
import { CompositeAIService } from '../src/infrastructure/ai/composite-ai.service.js';
import { RuleBasedFallbackProvider } from '../src/infrastructure/ai/rule-based-fallback.provider.js';
import { ConversationsController } from '../src/presentation/controllers/conversations.controller.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';

const isPostgresConfigured = Boolean(
  process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.startsWith('postgresql://') || process.env.DATABASE_URL.startsWith('postgres://'))
);

describe.skipIf(!isPostgresConfigured)('Suíte Completa de Validação de Domínio, IA e Cenários E2E (A a H + Regressão Canônica)', () => {
  let mockWhatsApp: MockWhatsAppProvider;
  let compositeAI: CompositeAIService;
  let importUseCase: ImportAttendanceUseCase;
  let dispatchUseCase: DispatchCampaignUseCase;
  let inboundUseCase: ProcessInboundMessageUseCase;
  let orgId: string;

  beforeAll(async () => {
    mockWhatsApp = MockWhatsAppProvider.getInstance();
    compositeAI = new CompositeAIService();
    importUseCase = new ImportAttendanceUseCase();
    dispatchUseCase = new DispatchCampaignUseCase(mockWhatsApp);
    inboundUseCase = new ProcessInboundMessageUseCase(compositeAI);

    // Cria organização de teste isolada
    const org = await prisma.organization.create({
      data: {
        name: 'Org Scenarios Test',
        slug: `org-scenarios-${Date.now()}`
      }
    });
    orgId = org.id;
  }, 30000);

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.followUpTask.deleteMany({ where: { organizationId: orgId } });
        await prisma.consentHistory.deleteMany({ where: { organizationId: orgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: orgId } });
        await prisma.message.deleteMany({ where: { organizationId: orgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
        await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
        await prisma.attendance.deleteMany({ where: { organizationId: orgId } });
        await prisma.person.deleteMany({ where: { organizationId: orgId } });
        await prisma.event.deleteMany({ where: { organizationId: orgId } });
        await prisma.gpnWebhookEvent.deleteMany({ where: { organizationId: orgId } });
        await prisma.gpnConnection.deleteMany({ where: { organizationId: orgId } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    } catch {
      // Ignora erros de teardown
    }
  });

  // =========================================================================
  // TESTE DE REGRESSÃO END-TO-END CANÔNICO (10 Pessoas: 4 Presentes, 6 Ausentes)
  // =========================================================================
  it('Regressão Canônica: Fluxo completo de 10 pessoas (4 presentes, 6 ausentes) com IA, Follow-ups e Opt-Out', async () => {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        name: 'Culto de Celebração e Família',
        eventDate: new Date('2026-08-28T19:00:00Z'),
        location: 'Auditório Central'
      }
    });

    const rows = [
      // 4 Presentes
      { Nome: 'Lucas Ferreira', Telefone: '(11) 98111-0001', Participou: 'Sim' },
      { Nome: 'Beatriz Almeida', Telefone: '(11) 98111-0002', Participou: 'Sim' },
      { Nome: 'Gabriel Santos', Telefone: '(11) 98111-0003', Participou: 'Sim' },
      { Nome: 'Juliana Mendes', Telefone: '(11) 98111-0004', Participou: 'Sim' },

      // 6 Ausentes
      { Nome: 'Mariana Souza', Telefone: '(11) 98765-4321', Participou: 'Não' }, // Saúde
      { Nome: 'Carlos Eduardo', Telefone: '(11) 98111-0005', Participou: 'Não' }, // Saúde / Crise
      { Nome: 'Rodrigo Lima', Telefone: '(11) 98111-0006', Participou: 'Não' },   // Trabalho
      { Nome: 'Fernanda Costa', Telefone: '(11) 98111-0007', Participou: 'Não' }, // Trabalho
      { Nome: 'Paulo Ricardo', Telefone: '(11) 98111-0008', Participou: 'Não' },  // Ambíguo
      { Nome: 'Carla Nogueira', Telefone: '(11) 98111-0009', Participou: 'Não' }  // Opt-out
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Presencas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 1. Importação
    const importRes = await importUseCase.execute({
      organizationId: orgId,
      eventId: event.id,
      fileBuffer: buffer
    });

    expect(importRes.totalImported).toBe(10);
    expect(importRes.totalPresent).toBe(4);
    expect(importRes.totalAbsent).toBe(6);

    // 2. Disparo para os 6 Ausentes
    const campRes = await dispatchUseCase.execute({
      organizationId: orgId,
      eventId: event.id,
      type: 'AUSENTE_FOLLOWUP',
      messageTemplate: 'Olá, {{nome}}! Sentimos sua falta no {{evento}}!'
    });

    expect(campRes.totalRecipients).toBe(6);
    expect(campRes.totalSent).toBe(6);

    // 3. Simulação de Respostas dos 6 Ausentes
    // 2 Saúde
    const res1 = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: '+5511987654321',
      text: 'Oi pastor! Tive febre alta e fui na UPA com minha filha.'
    });
    expect(res1.classification?.category).toBe('SAUDE');
    expect(res1.classification?.priority).toBe('HIGH');
    expect(res1.followUpTaskId).toBeDefined();

    const res2 = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: '+5511981110005',
      text: 'Pastor, estou em crise de depressão precisando de oração e socorro.'
    });
    expect(res2.classification?.category).toBe('PEDIDO_ATENDIMENTO');
    expect(res2.classification?.priority).toBe('URGENT');
    expect(res2.followUpTaskId).toBeDefined();

    // 2 Trabalho
    const res3 = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: '+5511981110006',
      text: 'Boa noite! Peguei escala de plantão extra no trabalho.'
    });
    expect(res3.classification?.category).toBe('TRABALHO');
    expect(res3.classification?.priority).toBe('LOW');

    const res4 = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: '+5511981110007',
      text: 'Olá! Estava trabalhando no turno da noite da empresa.'
    });
    expect(res4.classification?.category).toBe('TRABALHO');

    // 1 Ambíguo
    const res5 = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: '+5511981110008',
      text: '👍 ok'
    });
    expect(res5.classification?.category).toBe('INCONCLUSIVO');

    // 1 Opt-Out
    const res6 = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: '+5511981110009',
      text: 'SAIR'
    });
    expect(res6.isOptOut).toBe(true);

    const personOptOut = await prisma.person.findUnique({
      where: {
        organizationId_normalizedPhone: {
          organizationId: orgId,
          normalizedPhone: '+5511981110009'
        }
      }
    });
    expect(personOptOut?.optOut).toBe(true);
    expect(personOptOut?.consentStatus).toBe('OPTED_OUT');

    // 4. Verificação de Tarefas de Acompanhamento (Follow-Ups)
    const pendingTasks = await prisma.followUpTask.findMany({
      where: { organizationId: orgId, status: 'PENDING' }
    });
    expect(pendingTasks.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  // =========================================================================
  // CENÁRIO B: Deduplicação
  // =========================================================================
  it('Cenário B: Deve tratar duplicidades de contatos sem duplicar registros', async () => {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        name: 'Culto de Quarta',
        eventDate: new Date()
      }
    });

    const rows = [
      { Nome: 'Pedro Silva', Telefone: '(11) 98888-1111', Participou: 'Não' },
      { Nome: 'Pedro Silva Santos', Telefone: '11 98888-1111', Participou: 'Sim' }
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Presencas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const importResult = await importUseCase.execute({
      organizationId: orgId,
      eventId: event.id,
      fileBuffer: buffer
    });

    expect(importResult.totalImported).toBe(1);
    expect(importResult.duplicatesIgnored).toBe(1);
  });

  // =========================================================================
  // CENÁRIO C: Telefone inválido
  // =========================================================================
  it('Cenário C: Deve isolar telefones inválidos sem abortar o lote', async () => {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        name: 'Workshop',
        eventDate: new Date()
      }
    });

    const rows = [
      { Nome: 'Contato Válido', Telefone: '(11) 99999-8888', Participou: 'Sim' },
      { Nome: 'Telefone Falso', Telefone: '12345', Participou: 'Não' }
    ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Presencas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const importResult = await importUseCase.execute({
      organizationId: orgId,
      eventId: event.id,
      fileBuffer: buffer
    });

    expect(importResult.totalImported).toBe(1);
    expect(importResult.invalidRows.length).toBe(1);
  });

  // =========================================================================
  // CENÁRIO G: Falha no WhatsApp
  // =========================================================================
  it('Cenário G: Deve tratar graciosa e resilientemente erro de entrega', async () => {
    const event = await prisma.event.create({
      data: {
        organizationId: orgId,
        name: 'Evento Erro',
        eventDate: new Date()
      }
    });

    const person = await prisma.person.create({
      data: {
        organizationId: orgId,
        name: 'Contato Teste',
        phone: '11911112222',
        normalizedPhone: '+5511911112222',
        optOut: false
      }
    });

    await prisma.attendance.create({
      data: {
        organizationId: orgId,
        personId: person.id,
        eventId: event.id,
        attended: false,
        invited: true
      }
    });

    mockWhatsApp.setFailNextSend(true);

    const campaignResult = await dispatchUseCase.execute({
      organizationId: orgId,
      eventId: event.id,
      type: 'AUSENTE_FOLLOWUP',
      messageTemplate: 'Olá {{nome}}!'
    });

    expect(campaignResult.totalFailed).toBe(1);
    expect(campaignResult.messages[0].status).toBe('FAILED');
  });

  // =========================================================================
  // CENÁRIO H: Resiliência de IA Offline (Fallback Heurístico Local)
  // =========================================================================
  it('Cenário H: Deve acionar o Rule-Based Fallback local caso a IA externa esteja offline', async () => {
    const fallbackEngine = new RuleBasedFallbackProvider();

    const analysis = await fallbackEngine.classifyAbsence(
      'Estou viajando fora da cidade de férias com minha família.',
      { personName: 'Felipe', eventName: 'Culto de Domingo' }
    );

    expect(analysis.category).toBe('VIAGEM');
    expect(analysis.providerUsed).toBe('RULE_BASED_FALLBACK');
    expect(analysis.priority).toBe('LOW');
  });

  // =========================================================================
  // CENÁRIO I: Webhook Idempotente (Retries da Meta)
  // =========================================================================
  it('Cenário I: Deve ser estritamente idempotente em caso de webhook duplicado da Meta', async () => {
    const duplicateWamid = 'wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggMTIzNDU2Nzg5';
    const testPhone = '11944445555';

    // 1º envio do webhook
    const firstResult = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: testPhone,
      text: 'Não consegui ir no culto porque estava de plantão no hospital.',
      providerMessageId: duplicateWamid
    });

    expect(firstResult.messageId).toBeDefined();

    const totalMessagesBefore = await prisma.message.count({
      where: { organizationId: orgId, providerMessageId: duplicateWamid }
    });
    expect(totalMessagesBefore).toBe(1);

    const totalAnalysesBefore = await prisma.aIAnalysis.count({
      where: { organizationId: orgId, messageId: firstResult.messageId }
    });
    expect(totalAnalysesBefore).toBe(1);

    // 2º envio do webhook com o MESMO providerMessageId (simulando retry da Meta)
    const secondResult = await inboundUseCase.execute({
      organizationId: orgId,
      fromPhone: testPhone,
      text: 'Não consegui ir no culto porque estava de plantão no hospital.',
      providerMessageId: duplicateWamid
    });

    // Deve retornar o mesmo ID sem lançar erro de colisão (P2002)
    expect(secondResult.messageId).toBe(firstResult.messageId);

    const totalMessagesAfter = await prisma.message.count({
      where: { organizationId: orgId, providerMessageId: duplicateWamid }
    });
    expect(totalMessagesAfter).toBe(1); // Nenhuma mensagem duplicada

    const totalAnalysesAfter = await prisma.aIAnalysis.count({
      where: { organizationId: orgId, messageId: firstResult.messageId }
    });
    expect(totalAnalysesAfter).toBe(1); // Nenhuma análise duplicada
  });

  // =========================================================================
  // CENÁRIO J: Janela de Atendimento de 24 Horas da Meta
  // =========================================================================
  it('Cenário J: Deve validar a janela de 24 horas para mensagens de texto livre', async () => {
    // Configura conexão Meta para a organização ativar a regra da janela de 24h
    await prisma.whatsAppConnection.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        phoneNumberId: 'meta_scenario_phone_id',
        wabaId: 'meta_scenario_waba_id',
        encryptedAccessToken: CryptoService.encrypt('meta_test_token'),
        encryptedAppSecret: CryptoService.encrypt('meta_test_secret'),
        isMock: false,
        status: 'CONNECTED'
      },
      update: {
        phoneNumberId: 'meta_scenario_phone_id',
        isMock: false,
        status: 'CONNECTED'
      }
    });

    const conversationsController = new ConversationsController(mockWhatsApp);

    // 1. Cria uma conversa sem nenhuma mensagem inbound (janela fechada)
    const person = await prisma.person.create({
      data: {
        organizationId: orgId,
        name: 'Contato Sem Inbound',
        phone: '11977778888',
        normalizedPhone: '+5511977778888',
        optOut: false
      }
    });

    const closedConv = await prisma.conversation.create({
      data: {
        organizationId: orgId,
        personId: person.id,
        status: 'OPEN'
      }
    });

    // Mock de Response do Express
    let statusCode = 0;
    let responseBody: any = null;
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: (data: any) => {
        responseBody = data;
        return mockRes;
      }
    };

    // Tentativa 1: Envio sem mensagem inbound anterior -> Bloqueado 422
    await conversationsController.reply(
      { params: { id: closedConv.id }, body: { text: 'Olá, tudo bem?' }, organizationId: orgId } as any,
      mockRes
    );

    expect(statusCode).toBe(422);
    expect(responseBody.error).toBe('JANELA_24H_EXPIRADA');

    // 2. Simula mensagem inbound recebida há 30 horas atrás (janela expirada)
    await prisma.message.create({
      data: {
        organizationId: orgId,
        conversationId: closedConv.id,
        personId: person.id,
        direction: 'INBOUND',
        content: 'Mensagem antiga',
        status: 'READ',
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000) // 30h atrás
      }
    });

    await conversationsController.reply(
      { params: { id: closedConv.id }, body: { text: 'Respondendo 30h depois' }, organizationId: orgId } as any,
      mockRes
    );

    expect(statusCode).toBe(422);
    expect(responseBody.error).toBe('JANELA_24H_EXPIRADA');

    // 3. Simula mensagem inbound recebida há 2 horas atrás (janela aberta)
    await prisma.message.create({
      data: {
        organizationId: orgId,
        conversationId: closedConv.id,
        personId: person.id,
        direction: 'INBOUND',
        content: 'Oi, boa tarde!',
        status: 'READ',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2h atrás
      }
    });

    await conversationsController.reply(
      { params: { id: closedConv.id }, body: { text: 'Olá! Como posso te ajudar?' }, organizationId: orgId } as any,
      mockRes
    );

    expect(statusCode).toBe(201);
    expect(responseBody.message).toBeDefined();
    expect(responseBody.message.content).toBe('Olá! Como posso te ajudar?');
  });
});
