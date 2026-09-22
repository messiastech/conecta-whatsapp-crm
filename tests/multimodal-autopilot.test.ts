import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { ProcessInboundMessageUseCase } from '../src/application/use-cases/process-inbound-message.use-case.js';
import { MediaStorageService } from '../src/infrastructure/storage/media-storage.service.js';
import { MediaIngestionService } from '../src/application/services/media-ingestion.service.js';
import { GeminiAIProvider } from '../src/infrastructure/ai/gemini-ai.provider.js';
import { DeepSeekAIProvider } from '../src/infrastructure/ai/deepseek-ai.provider.js';
import { ConversationMemoryService } from '../src/application/services/conversation-memory.service.js';
import { AttachmentType } from '@prisma/client';

describe('Milestone — Yeshua AI Autopilot V1 Multimodal (Áudio, Imagem, PDF, Vídeo, Legenda e Memória)', () => {
  let tenantAId: string;
  let tenantBId: string;
  let personAId: string;
  let conversationAId: string;
  let geminiProvider: GeminiAIProvider;
  let inboundUseCase: ProcessInboundMessageUseCase;

  const runId = Math.random().toString(36).substring(2, 7);

  beforeAll(async () => {
    // 1. Cria Tenant A (Yeshua Contabilidade - Multimodal Ativo)
    const orgA = await prisma.organization.create({
      data: {
        name: `Yeshua Multimodal Org A ${runId}`,
        slug: `yeshua-multimodal-a-${runId}`,
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING' }),
        settings: {
          create: {
            aiProvider: 'GEMINI',
            aiModel: 'gemini-2.0-flash',
            aiAutopilotEnabled: true,
            aiAutoReplyMinConfidence: 0.80
          }
        },
        gpnConnection: {
          create: {
            apiUrl: 'http://localhost:3000',
            encryptedApiKey: 'mock-encrypted-key',
            sessionId: `sess_multi_a_${runId}`,
            status: 'CONNECTED',
            isActive: true
          }
        }
      }
    });
    tenantAId = orgA.id;

    // 2. Cria Tenant B (Isolamento Multi-Tenant)
    const orgB = await prisma.organization.create({
      data: {
        name: `Outra Empresa Tenant B ${runId}`,
        slug: `outra-empresa-b-${runId}`,
        metadata: JSON.stringify({ verticalProfile: 'DEFAULT' }),
        settings: {
          create: {
            aiProvider: 'GEMINI',
            aiAutopilotEnabled: false
          }
        }
      }
    });
    tenantBId = orgB.id;

    // 3. Cria Pessoa e Conversa para o Tenant A
    const personA = await prisma.person.create({
      data: {
        organizationId: tenantAId,
        name: 'Pastor João Silva (Igreja Graça e Paz)',
        phone: '+5511988880001',
        normalizedPhone: '+5511988880001',
        notes: JSON.stringify({
          clientName: 'Pastor João Silva',
          churchName: 'Igreja Graça e Paz',
          isChurch: true
        })
      }
    });
    personAId = personA.id;

    const convA = await prisma.conversation.create({
      data: {
        organizationId: tenantAId,
        personId: personA.id,
        status: 'OPEN',
        priority: 'MEDIUM'
      }
    });
    conversationAId = convA.id;

    // 4. Instancia Gemini Provider e Use Case
    geminiProvider = new GeminiAIProvider('mock-gemini-key', 'gemini-2.0-flash');
    inboundUseCase = new ProcessInboundMessageUseCase(geminiProvider);
  });

  afterAll(async () => {
    // Limpa storage e banco de teste
    if (tenantAId) MediaStorageService.clearTenantStorage(tenantAId);
    if (tenantBId) MediaStorageService.clearTenantStorage(tenantBId);
    const orgIds = [tenantAId, tenantBId].filter(Boolean);
    if (orgIds.length === 0) return;

    await prisma.messageAttachment.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.conversationMemory.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.message.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.conversation.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.person.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.organizationSettings.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.gpnConnection.deleteMany({
      where: { organizationId: { in: orgIds } }
    });
    await prisma.organization.deleteMany({
      where: { id: { in: orgIds } }
    });
  });

  // ----------------------------------------------------
  // CENÁRIO 1: Áudio inbound cria attachment e transcript
  // ----------------------------------------------------
  it('1. Áudio inbound cria attachment persistido e gera transcrição utilizável', async () => {
    const audioBuffer = Buffer.from('FAKE_OGG_AUDIO_CONTENT_FOR_VOICE_NOTE');
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      senderName: 'Pastor João Silva',
      text: '', // Mensagem de voz enviada sem texto
      media: [
        {
          type: 'audio',
          mimeType: 'audio/ogg',
          fileName: 'audio_duvida_abertura.ogg',
          buffer: audioBuffer,
          durationSeconds: 12
        }
      ],
      providerMessageId: `wamid.audio_${runId}_001`
    });

    expect(res.messageId).toBeDefined();
    expect(res.attachments).toBeDefined();
    expect(res.attachments!.length).toBe(1);

    const attachment = res.attachments![0];
    expect(attachment.type).toBe(AttachmentType.AUDIO);
    expect(attachment.mimeType).toBe('audio/ogg');
    expect(attachment.transcript).toBeDefined();
    expect(attachment.transcript).toContain('contabilidade');

    // Confirma no banco Neon
    const dbAttachment = await prisma.messageAttachment.findUnique({
      where: { id: attachment.id }
    });
    expect(dbAttachment).not.toBeNull();
    expect(dbAttachment!.transcript).toBe(attachment.transcript);
    expect(dbAttachment!.storageKey).toContain(tenantAId);
  });

  // ----------------------------------------------------
  // CENÁRIO 2: Imagem entra no contexto da IA
  // ----------------------------------------------------
  it('2. Imagem entra no contexto da IA com extração e sem alucinação', async () => {
    const imgBuffer = Buffer.from('FAKE_JPEG_IMAGE_CONTENT');
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      media: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'comprovante_das_simples.jpg',
          buffer: imgBuffer
        }
      ],
      providerMessageId: `wamid.img_${runId}_002`
    });

    expect(res.attachments).toBeDefined();
    expect(res.attachments![0].type).toBe(AttachmentType.IMAGE);
    expect(res.attachments![0].aiSummary).toContain('Comprovante');
    expect(res.autopilotDecision).toBeDefined();
    expect(res.classification?.category).toBeDefined();
  });

  // ----------------------------------------------------
  // CENÁRIO 3: Caption + Imagem são interpretados juntos
  // ----------------------------------------------------
  it('3. Caption e imagem são interpretados em conjunto como mesma mensagem', async () => {
    const imgBuffer = Buffer.from('FAKE_RECEIPT_IMAGE');
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      text: 'Isso aqui está certo para o mês atual?',
      media: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'recibo_pagamento.jpg',
          buffer: imgBuffer,
          caption: 'Isso aqui está certo para o mês atual?'
        }
      ],
      providerMessageId: `wamid.caption_img_${runId}_003`
    });

    // O sistema consolidou o texto da pergunta com o anexo
    expect(res.classification).toBeDefined();
    expect(res.classification?.summary).toBeDefined();
  });

  // ----------------------------------------------------
  // CENÁRIO 4: PDF gera conteúdo estruturado
  // ----------------------------------------------------
  it('4. PDF gera conteúdo estruturado e extrai fatos cadastrais/fiscais', async () => {
    const pdfBuffer = Buffer.from('FAKE_PDF_DOCUMENT_CONTENT');
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      text: 'Segue nosso estatuto registrado em cartório',
      media: [
        {
          type: 'document',
          mimeType: 'application/pdf',
          fileName: 'estatuto_consolidado_igreja.pdf',
          buffer: pdfBuffer
        }
      ],
      providerMessageId: `wamid.pdf_${runId}_004`
    });

    expect(res.attachments).toBeDefined();
    expect(res.attachments![0].type).toBe(AttachmentType.PDF);
    expect(res.attachments![0].extractedText).toContain('Estatuto Social');

    // Verifica se os fatos foram parar no banco
    const memory = await prisma.conversationMemory.findUnique({
      where: { conversationId: conversationAId }
    });
    expect(memory).not.toBeNull();
    const facts = JSON.parse(memory!.factsJson);
    expect(facts.documentosCadastraisRecebidos).toBe(true);
  });

  // ----------------------------------------------------
  // CENÁRIO 5: Vídeo é reconhecido como mídia suportada
  // ----------------------------------------------------
  it('5. Vídeo é reconhecido como mídia suportada e processado sem falhas', async () => {
    const videoBuffer = Buffer.from('FAKE_MP4_VIDEO_STREAM');
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      media: [
        {
          type: 'video',
          mimeType: 'video/mp4',
          fileName: 'erro_conectividade_social.mp4',
          buffer: videoBuffer,
          durationSeconds: 8
        }
      ],
      providerMessageId: `wamid.vid_${runId}_005`
    });

    expect(res.attachments![0].type).toBe(AttachmentType.VIDEO);
    expect(res.attachments![0].aiSummary).toContain('Vídeo');
  });

  // ----------------------------------------------------
  // CENÁRIO 6: Arquivo não é armazenado como blob no Neon
  // ----------------------------------------------------
  it('6. Arquivo bruto NUNCA é armazenado como blob/base64 dentro do Neon PostgreSQL', async () => {
    const bigBuffer = Buffer.alloc(1024 * 50, 'A'); // 50KB
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      media: [
        {
          type: 'document',
          mimeType: 'application/pdf',
          fileName: 'documento_pesado.pdf',
          buffer: bigBuffer
        }
      ],
      providerMessageId: `wamid.noblob_${runId}_006`
    });

    const att = await prisma.messageAttachment.findUnique({
      where: { id: res.attachments![0].id }
    });

    expect(att).not.toBeNull();
    // Confirma que não há coluna de blob e que storageKey aponta para arquivo seguro
    expect(att!.storageKey).toBeDefined();
    expect(att!.storageKey).toContain(tenantAId);

    // Confirma que no banco o metadataJson não tem o base64 bruto
    expect(att!.metadataJson).not.toContain('AAAAAAA');

    // Confirma que a memória não contém o base64
    const memory = await prisma.conversationMemory.findUnique({
      where: { conversationId: conversationAId }
    });
    expect(memory!.factsJson).not.toContain('AAAAAAA');
  });

  // ----------------------------------------------------
  // CENÁRIO 7: Resultado da mídia entra na memória persistente
  // ----------------------------------------------------
  it('7. Resultado derivado da mídia entra nos facts da memória persistente', async () => {
    const memory = await ConversationMemoryService.loadContext(tenantAId, personAId, conversationAId);
    expect(memory.facts.documentosRecebidos).toBeDefined();
    expect(Array.isArray(memory.facts.documentosRecebidos)).toBe(true);
    expect(memory.facts.documentosRecebidos.length).toBeGreaterThan(0);
  });

  // ----------------------------------------------------
  // CENÁRIO 8: Segunda mensagem consegue referenciar mídia anterior
  // ----------------------------------------------------
  it('8. Segunda mensagem (follow-up) referencia o anexo anterior sem reenviar o arquivo', async () => {
    // Cliente manda: "Vocês conseguiram validar o estatuto que enviei?"
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      text: 'Vocês conseguiram validar aquele documento que enviei?',
      providerMessageId: `wamid.followup_${runId}_008`
    });

    // A memória contextual e as mensagens recentes carregaram o resumo do anexo anterior
    expect(res.classification).toBeDefined();
    expect(res.memoryContext.facts.documentosCadastraisRecebidos).toBe(true);
  });

  // ----------------------------------------------------
  // CENÁRIO 9: Documento de alto risco escala para humano
  // ----------------------------------------------------
  it('9. Documento de alto risco fiscal (notificação/auto de infração) aciona HUMAN_ESCALATION e cria tarefa', async () => {
    const noticeBuffer = Buffer.from('FAKE_RECEITA_NOTICE_DOCUMENT');
    const res = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      text: 'Acabamos de receber isto pelo correio, precisamos de ajuda urgente',
      media: [
        {
          type: 'document',
          mimeType: 'application/pdf',
          fileName: 'notificacao_fiscal_receita_federal.pdf',
          buffer: noticeBuffer
        }
      ],
      providerMessageId: `wamid.notice_${runId}_009`
    });

    // Safety gate de mídia deve elevar para HUMAN_ESCALATION
    expect(res.classification?.requiresHumanAttention).toBe(true);
    expect(res.classification?.urgency).toMatch(/ALTA|CRITICA/);
    expect(res.classification?.nextAction).toBe('ESCALATE_TO_SENIOR_AUDITOR');
    expect(res.followUpTaskId).toBeDefined();
  });

  // ----------------------------------------------------
  // CENÁRIO 10: Mídia duplicada não gera respostas duplicadas
  // ----------------------------------------------------
  it('10. Mídia duplicada com mesmo providerMessageId é idempotente e não reenvia resposta', async () => {
    const sameMessageId = `wamid.idempotent_${runId}_010`;
    const buffer = Buffer.from('SAMPLE_DATA');

    // Primeira execução
    const firstRes = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      text: 'Foto do evento',
      media: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'foto.jpg',
          buffer
        }
      ],
      providerMessageId: sameMessageId
    });

    // Segunda execução (Webhook retry do WhatsApp/GPN)
    const secondRes = await inboundUseCase.execute({
      organizationId: tenantAId,
      fromPhone: '+5511988880001',
      text: 'Foto do evento',
      media: [
        {
          type: 'image',
          mimeType: 'image/jpeg',
          fileName: 'foto.jpg',
          buffer
        }
      ],
      providerMessageId: sameMessageId
    });

    expect(secondRes.messageId).toBe(firstRes.messageId);
    expect(secondRes.autoReplySent).toBeFalsy();
  });

  // ----------------------------------------------------
  // CENÁRIO 11: Isolamento Multi-Tenant estrito de arquivos
  // ----------------------------------------------------
  it('11. Arquivo de Tenant A NUNCA pode ser acessado pelo Tenant B (Segurança Estrita)', async () => {
    const testBuffer = Buffer.from('TENANT_A_CONFIDENTIAL_PAYROLL');
    const stored = await MediaStorageService.saveFile({
      organizationId: tenantAId,
      buffer: testBuffer,
      mimeType: 'application/pdf',
      originalName: 'folha_pagamento_sigilosa.pdf'
    });

    // Tenant A acessa normalmente
    const fileForA = await MediaStorageService.getFile(stored.storageKey, tenantAId);
    expect(fileForA.toString()).toBe('TENANT_A_CONFIDENTIAL_PAYROLL');

    // Tenant B tentando acessar a storageKey do Tenant A deve ser rejeitado imediatamente
    await expect(
      MediaStorageService.getFile(stored.storageKey, tenantBId)
    ).rejects.toThrow(/Violação de segurança: acesso cruzado/);
  });

  // ----------------------------------------------------
  // CENÁRIO 12: Provider sem capability multimodal falha de forma segura
  // ----------------------------------------------------
  it('12. Provedor sem capability multimodal (DeepSeek texto puro) escala para humano de forma segura se receber mídia bruta', async () => {
    const deepSeekProvider = new DeepSeekAIProvider('mock-deepseek-key', 'deepseek-chat');

    expect(deepSeekProvider.capabilities.supportsImages).toBe(false);
    expect(deepSeekProvider.capabilities.supportsAudio).toBe(false);

    // Chama DeepSeek diretamente com anexo não processado
    const replyResult = await deepSeekProvider.generateAccountingReply({
      organization: { id: tenantAId, name: 'Yeshua' },
      person: { id: personAId, name: 'Pastor João', normalizedPhone: '+5511988880001' },
      memory: { summary: '', facts: {}, openItems: [], preferences: {} },
      recentMessages: [],
      inboundMessage: {
        id: 'msg-raw-media',
        text: 'Conferir isto',
        receivedAt: new Date(),
        attachments: [
          {
            type: 'IMAGE',
            mimeType: 'image/png',
            fileName: 'print_tela.png',
            base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          }
        ]
      }
    });

    // Deve falhar com segurança para atendimento humano e NÃO quebrar com erro 400 da API
    expect(replyResult.decision).toBe('HUMAN_ESCALATION');
    expect(replyResult.riskLevel).toBe('HIGH');
    expect(replyResult.reply).toContain('equipe');
  });
});
