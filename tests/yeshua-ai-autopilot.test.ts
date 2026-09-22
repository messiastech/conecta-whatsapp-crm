import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { ProcessInboundMessageUseCase } from '../src/application/use-cases/process-inbound-message.use-case.js';
import { ConversationMemoryService } from '../src/application/services/conversation-memory.service.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { CompositeAIService } from '../src/infrastructure/ai/composite-ai.service.js';
import { AIProviderFactory } from '../src/infrastructure/ai/ai-provider.factory.js';
import { IAIService, GenerateAccountingReplyParams, AccountingAIReplyResult } from '../src/domain/ports/ai-service.port.js';

describe('Milestone — Yeshua AI Autopilot V1 com Memória Persistente e Abstração Multi-Modelo', () => {
  let tenantA: any;
  let tenantB: any;
  let personA: any;
  let personB: any;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    process.env.ENCRYPTION_MASTER_KEY =
      process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

    const suffix = Date.now().toString(36);

    // Tenant A (Yeshua Contabilidade / Autopilot Test)
    tenantA = await prisma.organization.create({
      data: {
        name: `Yeshua Tenant A ${suffix}`,
        slug: `yeshua-tenant-a-${suffix}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN'
        }),
        settings: {
          create: {
            timezone: 'America/Sao_Paulo',
            language: 'pt-BR',
            aiAutopilotEnabled: false, // Default false
            aiAutoReplyMinConfidence: 0.8
          }
        },
        gpnConnection: {
          create: {
            apiUrl: 'http://localhost:3000',
            encryptedApiKey: CryptoService.encrypt('gpn_prod_key_valid'),
            sessionId: `sess_a_${suffix}`,
            status: 'CONNECTED',
            isActive: true
          }
        }
      }
    });

    // Tenant B (Tenant Isolado)
    tenantB = await prisma.organization.create({
      data: {
        name: `Tenant B Isolado ${suffix}`,
        slug: `tenant-b-${suffix}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN'
        }),
        settings: {
          create: {
            timezone: 'America/Sao_Paulo',
            language: 'pt-BR',
            aiAutopilotEnabled: false,
            aiAutoReplyMinConfidence: 0.8
          }
        }
      }
    });

    personA = await prisma.person.create({
      data: {
        organizationId: tenantA.id,
        name: 'Pastor Marcos (Igreja Batista Central)',
        phone: '+5511999990001',
        normalizedPhone: '+5511999990001',
        optOut: false,
        notes: JSON.stringify({
          clientName: 'Pastor Marcos',
          churchName: 'Igreja Batista Central',
          isChurch: true
        })
      }
    });

    personB = await prisma.person.create({
      data: {
        organizationId: tenantB.id,
        name: 'Diretor Roberto',
        phone: '+5511999990002',
        normalizedPhone: '+5511999990002',
        optOut: false
      }
    });
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    try {
      const orgIds = [tenantA?.id, tenantB?.id].filter(Boolean);
      for (const orgId of orgIds) {
        await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
        await prisma.followUpTask.deleteMany({ where: { organizationId: orgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: orgId } });
        await prisma.message.deleteMany({ where: { organizationId: orgId } });
        await prisma.conversationMemory.deleteMany({ where: { organizationId: orgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
        await prisma.person.deleteMany({ where: { organizationId: orgId } });
        await prisma.organizationSettings.deleteMany({ where: { organizationId: orgId } });
        await prisma.gPNConnection.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      }
    } catch {}
  });

  // Helper para simular IA Real Gemini com respostas controladas
  const createMockRealAI = (customLogic?: (params: GenerateAccountingReplyParams) => Partial<AccountingAIReplyResult>): IAIService => {
    return {
      classifyAbsence: async () => ({
        category: 'OUTRO',
        sentiment: 'NEUTRO',
        confidence: 0.9,
        summary: 'Classificação geral',
        requires_human_attention: false,
        providerUsed: 'MOCK_REAL_AI'
      }),
      generateSuggestedReply: async () => ({
        suggestedReply: 'Resposta sugerida',
        providerUsed: 'MOCK_REAL_AI'
      }),
      generateAccountingReply: async (params: GenerateAccountingReplyParams): Promise<AccountingAIReplyResult> => {
        if (customLogic) {
          const custom = customLogic(params);
          return {
            reply: custom.reply || 'Olá, como podemos ajudar?',
            confidence: custom.confidence ?? 0.95,
            intent: custom.intent || 'INQUIRY',
            category: custom.category || 'GERAL_CONTABIL',
            riskLevel: custom.riskLevel || 'LOW',
            decision: custom.decision || 'AUTO_REPLY',
            missingInformation: custom.missingInformation || [],
            memoryUpdates: custom.memoryUpdates || {},
            providerUsed: 'GEMINI',
            modelUsed: 'gemini-2.0-flash',
            latencyMs: 120,
            tokensUsed: { promptTokens: 100, candidateTokens: 50, totalTokens: 150 }
          };
        }

        return {
          reply: 'Olá! Como posso ajudar você hoje na Yeshua Contabilidade?',
          confidence: 0.95,
          intent: 'INQUIRY',
          category: 'GERAL_CONTABIL',
          riskLevel: 'LOW',
          decision: 'AUTO_REPLY',
          missingInformation: [],
          memoryUpdates: { facts: { canal: 'WhatsApp' } },
          providerUsed: 'GEMINI',
          modelUsed: 'gemini-2.0-flash',
          latencyMs: 150,
          tokensUsed: { promptTokens: 100, candidateTokens: 40, totalTokens: 140 }
        };
      }
    };
  };

  // Helper para simular provedor GPN real
  const createMockGpnProvider = (realMessageId = `gpn_msg_${Date.now()}`, shouldFail = false) => ({
    sendTextMessage: async (to: string, text: string) => {
      if (shouldFail) {
        return {
          success: false,
          messageId: '',
          recipientPhone: to,
          provider: 'GPN' as const,
          status: 'FAILED' as const,
          timestamp: new Date(),
          errorMessage: 'Sessão yeshua-prod desconectada do Baileys'
        };
      }
      return {
        success: true,
        messageId: realMessageId,
        recipientPhone: to,
        provider: 'GPN' as const,
        status: 'SENT' as const,
        timestamp: new Date()
      };
    },
    sendTemplateMessage: async () => { throw new Error('Not implemented'); },
    verifyWebhook: () => null,
    validateSignature: () => true,
    parseWebhookPayload: () => ({ messages: [], statuses: [] })
  });

  // =========================================================================
  // CENÁRIO 1: Mensagem simples -> AUTO_REPLY
  // =========================================================================
  it('1. Mensagem simples com autopilot ativado deve gerar AUTO_REPLY e enviar resposta', async () => {
    // Ativa autopilot temporariamente para o teste
    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: true, aiAutoReplyMinConfidence: 0.8 }
    });

    const origFactory = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => createMockGpnProvider('gpn_msg_c1') as any;

    try {
      const aiService = createMockRealAI(() => ({
        reply: 'Olá Pastor Marcos! A paz. Como podemos auxiliar a Igreja Batista Central hoje?',
        confidence: 0.95,
        riskLevel: 'LOW',
        decision: 'AUTO_REPLY'
      }));

      const useCase = new ProcessInboundMessageUseCase(aiService);
      const result = await useCase.execute({
        organizationId: tenantA.id,
        fromPhone: personA.phone,
        text: 'Olá, bom dia! Gostaria de uma informação simples.',
        providerMessageId: `inbound_c1_${Date.now()}`
      });

      expect(result.autopilotDecision).toBe('AUTO_REPLY');
      expect(result.autoReplySent).toBe(true);
      expect(result.outboundMessageId).toBeDefined();

      const outbound = await prisma.message.findUnique({
        where: { id: result.outboundMessageId }
      });
      expect(outbound).not.toBeNull();
      expect(outbound?.direction).toBe('OUTBOUND');
      expect(outbound?.status).toBe('SENT');
      expect(outbound?.content).toContain('Olá Pastor Marcos');
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = origFactory;
      await prisma.organizationSettings.update({
        where: { organizationId: tenantA.id },
        data: { aiAutopilotEnabled: false }
      });
    }
  });

  // =========================================================================
  // CENÁRIO 2: Outbound usa GPN, nunca mock
  // =========================================================================
  it('2. Outbound deve invocar o provider GPN oficial e nunca usar MockWhatsAppProvider', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'gpn';

    let gpnInvoked = false;
    const gpnProvider = {
      ...createMockGpnProvider('gpn_real_provider_id'),
      sendTextMessage: async (to: string, text: string) => {
        gpnInvoked = true;
        return {
          success: true,
          messageId: `gpn_real_provider_id_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          recipientPhone: to,
          provider: 'GPN' as const,
          status: 'SENT' as const,
          timestamp: new Date()
        };
      }
    };

    const origFactory = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => gpnProvider as any;

    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: true }
    });

    try {
      const aiService = createMockRealAI();
      const useCase = new ProcessInboundMessageUseCase(aiService);

      await useCase.execute({
        organizationId: tenantA.id,
        fromPhone: personA.phone,
        text: 'Qual o horário de expediente de vocês?',
        providerMessageId: `inbound_c2_${Date.now()}`
      });

      expect(gpnInvoked).toBe(true);
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = origFactory;
      await prisma.organizationSettings.update({
        where: { organizationId: tenantA.id },
        data: { aiAutopilotEnabled: false }
      });
    }
  });

  // =========================================================================
  // CENÁRIO 3: providerMessageId real persistido
  // =========================================================================
  it('3. providerMessageId real retornado pelo GPN deve ser gravado na mensagem OUTBOUND', async () => {
    const realMsgId = `gpn_baileys_wam_${Date.now()}`;
    const origFactory = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => createMockGpnProvider(realMsgId) as any;

    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: true }
    });

    try {
      const aiService = createMockRealAI();
      const useCase = new ProcessInboundMessageUseCase(aiService);

      const result = await useCase.execute({
        organizationId: tenantA.id,
        fromPhone: personA.phone,
        text: 'Vocês atendem no sábado?',
        providerMessageId: `inbound_c3_${Date.now()}`
      });

      const outbound = await prisma.message.findUnique({
        where: { id: result.outboundMessageId }
      });

      expect(outbound?.providerMessageId).toBe(realMsgId);
      expect(outbound?.providerMessageId).not.toContain('mock');
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = origFactory;
      await prisma.organizationSettings.update({
        where: { organizationId: tenantA.id },
        data: { aiAutopilotEnabled: false }
      });
    }
  });

  // =========================================================================
  // CENÁRIO 4: Segunda mensagem usa memória da primeira
  // =========================================================================
  it('4. Segunda mensagem deve carregar os fatos e resumo gerados na primeira mensagem', async () => {
    let capturedMemoryOnSecondCall: any = null;

    const aiService = createMockRealAI((params) => {
      if (params.inboundMessage.text.includes('primeira')) {
        return {
          reply: 'Entendido, gravando seu regime tributário.',
          decision: 'AUTO_REPLY',
          memoryUpdates: {
            facts: { regimeTributario: 'Simples Nacional', atividade: 'Treinamentos' },
            summary: 'Cliente informou que atua com treinamentos no Simples Nacional.'
          }
        };
      }
      if (params.inboundMessage.text.includes('segunda')) {
        capturedMemoryOnSecondCall = params.memory;
        return {
          reply: 'Vi que sua empresa é do Simples Nacional.',
          decision: 'AUTO_REPLY'
        };
      }
      return {};
    });

    const useCase = new ProcessInboundMessageUseCase(aiService);

    // 1ª mensagem
    await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Esta é a primeira mensagem: minha empresa é Simples Nacional e trabalho com treinamentos.',
      providerMessageId: `inbound_c4_1_${Date.now()}`
    });

    // 2ª mensagem
    await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Esta é a segunda mensagem: qual o limite de faturamento anual para o meu caso?',
      providerMessageId: `inbound_c4_2_${Date.now()}`
    });

    expect(capturedMemoryOnSecondCall).not.toBeNull();
    expect(capturedMemoryOnSecondCall.facts.regimeTributario).toBe('Simples Nacional');
    expect(capturedMemoryOnSecondCall.summary).toContain('Simples Nacional');
  });

  // =========================================================================
  // CENÁRIO 5: Restart -> memória continua no PostgreSQL
  // =========================================================================
  it('5. Após simulação de restart da aplicação, a memória persiste e é recarregada do PostgreSQL', async () => {
    const conv = await prisma.conversation.findFirst({
      where: { personId: personA.id, organizationId: tenantA.id }
    });

    // Atualiza explicitamente a memória no banco
    await ConversationMemoryService.updateAfterInbound(conv!.id, 'msg_restart_test', {
      facts: { cnpj: '12.345.678/0001-90', razaoSocial: 'Igreja Batista Central Teste' },
      summary: 'Igreja Batista Central com mandato vigente até 2027.'
    });

    // Simula reinício de aplicação carregando do zero através de uma nova chamada
    const loadedContext = await ConversationMemoryService.loadContext(
      tenantA.id,
      personA.id,
      conv!.id
    );

    expect(loadedContext.facts.cnpj).toBe('12.345.678/0001-90');
    expect(loadedContext.summary).toContain('mandato vigente até 2027');
  });

  // =========================================================================
  // CENÁRIO 6: Rolling summary não perde facts
  // =========================================================================
  it('6. Atualizações no rolling summary não devem sobrescrever nem perder os fatos estruturados', async () => {
    const conv = await prisma.conversation.findFirst({
      where: { personId: personA.id, organizationId: tenantA.id }
    });

    // 1. Grava fatos consolidados
    await ConversationMemoryService.updateAfterInbound(conv!.id, 'msg_facts_1', {
      facts: { prebendaValor: 5000, membros: 250 }
    });

    // 2. Executa múltiplos rolling summaries
    await ConversationMemoryService.summarizeIfNeeded(conv!.id, 'Qual a data do fechamento?');
    await ConversationMemoryService.summarizeIfNeeded(conv!.id, 'Pode me enviar o boleto?');
    await ConversationMemoryService.summarizeIfNeeded(conv!.id, 'Obrigado pelo suporte!');

    const loaded = await ConversationMemoryService.loadContext(tenantA.id, personA.id, conv!.id);

    expect(loaded.facts.prebendaValor).toBe(5000);
    expect(loaded.facts.membros).toBe(250);
    expect(loaded.summary.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // CENÁRIO 7: Pergunta incompleta -> IA pede dado, não escala
  // =========================================================================
  it('7. Pergunta incompleta ("Quero orçamento") deve fazer a IA pedir dados faltantes sem escalonar', async () => {
    const aiService = createMockRealAI((params) => {
      if (params.inboundMessage.text.toLowerCase().includes('orçamento')) {
        return {
          reply: 'Com certeza! Para eu direcionar corretamente sua proposta, é para MEI, empresa ou igreja? E qual o serviço desejado?',
          decision: 'AUTO_REPLY',
          riskLevel: 'LOW',
          missingInformation: ['tipo_entidade', 'servico_desejado'],
          memoryUpdates: {
            openItems: ['Coletar tipo de entidade (MEI/Empresa/Igreja)', 'Coletar serviço desejado']
          }
        };
      }
      return {};
    });

    const useCase = new ProcessInboundMessageUseCase(aiService);
    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Olá, quero um orçamento por favor.',
      providerMessageId: `inbound_c7_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    });

    console.log('RESULT C7:', JSON.stringify(result, null, 2));
    expect(result.autopilotDecision).toBe('AUTO_REPLY');
    expect(result.classification?.requiresHumanAttention).toBe(false);
    expect(result.followUpTaskId).toBeUndefined();
  });

  // =========================================================================
  // CENÁRIO 8: Fiscalização -> HUMAN_ESCALATION
  // =========================================================================
  it('8. Notificação fiscal ou auto de infração deve acionar HUMAN_ESCALATION e criar tarefa urgente', async () => {
    const aiService = createMockRealAI(() => ({
      // Mesmo se o modelo sugerisse auto reply, o safety gate DEVE forçar HUMAN_ESCALATION
      decision: 'AUTO_REPLY'
    }));

    const useCase = new ProcessInboundMessageUseCase(aiService);
    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'URGENTE: Recebemos um auto de infração e intimação da Receita Federal com prazo de 5 dias!',
      providerMessageId: `inbound_c8_${Date.now()}`
    });

    expect(result.autopilotDecision).toBe('HUMAN_ESCALATION');
    expect(result.autoReplySent).toBe(false);
    expect(result.followUpTaskId).toBeDefined();

    const task = await prisma.followUpTask.findUnique({
      where: { id: result.followUpTaskId }
    });
    expect(task).not.toBeNull();
    expect(task?.priority).toBe('URGENT');

    const auditLog = await prisma.auditLog.findFirst({
      where: { organizationId: tenantA.id, action: 'AI_ESCALATED' },
      orderBy: { createdAt: 'desc' }
    });
    expect(auditLog).not.toBeNull();
  });

  // =========================================================================
  // CENÁRIO 9: Usuário pede humano -> HUMAN_ESCALATION
  // =========================================================================
  it('9. Usuário solicitando explicitamente falar com atendente humano deve acionar HUMAN_ESCALATION', async () => {
    const aiService = createMockRealAI();
    const useCase = new ProcessInboundMessageUseCase(aiService);

    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Não quero falar com robô, quero falar com um atendente humano agora.',
      providerMessageId: `inbound_c9_${Date.now()}`
    });

    expect(result.autopilotDecision).toBe('HUMAN_ESCALATION');
    expect(result.autoReplySent).toBe(false);
    expect(result.followUpTaskId).toBeDefined();
  });

  // =========================================================================
  // CENÁRIO 10: Baixa confiança -> HUMAN_ESCALATION
  // =========================================================================
  it('10. Resposta com confiança inferior a minConfidence (0.80) deve acionar HUMAN_ESCALATION', async () => {
    const aiService = createMockRealAI(() => ({
      decision: 'AUTO_REPLY',
      confidence: 0.65 // Menor que o corte de 0.80
    }));

    const useCase = new ProcessInboundMessageUseCase(aiService);
    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Tenho uma dúvida confusa sobre permuta de ativos intangíveis.',
      providerMessageId: `inbound_c10_${Date.now()}`
    });

    expect(result.autopilotDecision).toBe('HUMAN_ESCALATION');
    expect(result.autoReplySent).toBe(false);
  });

  // =========================================================================
  // CENÁRIO 11: Gemini indisponível -> Não auto-responde
  // =========================================================================
  it('11. Quando o provedor Gemini estiver indisponível/offline, o sistema não deve auto-responder', async () => {
    // Provedor que simula falha do modelo real
    const failingAIService: IAIService = {
      classifyAbsence: async () => ({
        category: 'OUTRO',
        sentiment: 'NEUTRO',
        confidence: 0.5,
        summary: 'Fallback',
        requires_human_attention: true,
        providerUsed: 'FALLBACK'
      }),
      generateSuggestedReply: async () => ({
        suggestedReply: 'Resposta fallback',
        providerUsed: 'FALLBACK'
      }),
      generateAccountingReply: async () => {
        // Simula falha e retorno fail-safe com providerUsed: 'NONE'
        return {
          reply: 'Recebi sua mensagem. Nossa equipe fará a validação técnica.',
          confidence: 0.5,
          intent: 'FALLBACK',
          category: 'GERAL_CONTABIL',
          riskLevel: 'HIGH',
          decision: 'HUMAN_ESCALATION',
          missingInformation: [],
          memoryUpdates: {},
          providerUsed: 'NONE'
        };
      }
    };

    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: true }
    });

    try {
      const useCase = new ProcessInboundMessageUseCase(failingAIService);
      const result = await useCase.execute({
        organizationId: tenantA.id,
        fromPhone: personA.phone,
        text: 'Olá, teste de envio com IA offline.',
        providerMessageId: `inbound_c11_${Date.now()}`
      });

      expect(result.autoReplySent).toBe(false);
      expect(result.autopilotDecision).toBe('HUMAN_ESCALATION');
    } finally {
      await prisma.organizationSettings.update({
        where: { organizationId: tenantA.id },
        data: { aiAutopilotEnabled: false }
      });
    }
  });

  // =========================================================================
  // CENÁRIO 12: Opt-out -> Zero auto-reply comercial
  // =========================================================================
  it('12. Opt-out (SAIR / PARAR / CANCELAR) deve bloquear qualquer auto-reply e marcar optOut=true', async () => {
    const aiService = createMockRealAI();
    const useCase = new ProcessInboundMessageUseCase(aiService);
    const optOutPhone = '+5511999990099';

    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: optOutPhone,
      text: 'CANCELAR',
      providerMessageId: `inbound_c12_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    });

    expect(result.isOptOut).toBe(true);
    expect(result.autoReplySent).toBeFalsy();

    const person = await prisma.person.findFirst({
      where: { organizationId: tenantA.id, normalizedPhone: optOutPhone }
    });
    expect(person?.optOut).toBe(true);
    expect(person?.consentStatus).toBe('OPTED_OUT');
  });

  // =========================================================================
  // CENÁRIO 13: Webhook duplicado -> Uma única resposta
  // =========================================================================
  it('13. Webhook duplicado com o mesmo providerMessageId deve ser idempotente e não enviar 2 respostas', async () => {
    const duplicateId = `dup_provider_msg_${Date.now()}`;
    const aiService = createMockRealAI();
    const useCase = new ProcessInboundMessageUseCase(aiService);

    // 1ª entrega do webhook
    const firstResult = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Mensagem para teste de webhook duplicado.',
      providerMessageId: duplicateId
    });

    // 2ª entrega do webhook (retry da Meta/GPN)
    const secondResult = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Mensagem para teste de webhook duplicado.',
      providerMessageId: duplicateId
    });

    expect(firstResult.messageId).toBe(secondResult.messageId);

    // Total de mensagens salvas com esse providerMessageId deve ser estritamente 1
    const totalCount = await prisma.message.count({
      where: { providerMessageId: duplicateId }
    });
    expect(totalCount).toBe(1);
  });

  // =========================================================================
  // CENÁRIO 14: fromMe -> Zero loop
  // =========================================================================
  it('14. Mensagem com fromMe=true deve ser ignorada para evitar loop infinito de IA', async () => {
    const aiService = createMockRealAI();
    const useCase = new ProcessInboundMessageUseCase(aiService);

    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Mensagem enviada por mim mesmo no aparelho.',
      providerMessageId: `from_me_${Date.now()}`,
      rawPayload: { fromMe: true }
    });

    expect(result.autoReplySent).toBe(false);
    expect(result.messageId).toBe('');
  });

  // =========================================================================
  // CENÁRIO 15: Falha GPN -> Message FAILED + AuditLog
  // =========================================================================
  it('15. Falha no envio do GPN deve persistir mensagem OUTBOUND como FAILED e gravar AuditLog AI_PROVIDER_FAILED', async () => {
    const origFactory = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => createMockGpnProvider('', true) as any;

    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: true }
    });

    try {
      const aiService = createMockRealAI();
      const useCase = new ProcessInboundMessageUseCase(aiService);

      const result = await useCase.execute({
        organizationId: tenantA.id,
        fromPhone: personA.phone,
        text: 'Mensagem quando o GPN estiver com sessão Baileys desconectada.',
        providerMessageId: `inbound_c15_${Date.now()}`
      });

      expect(result.autoReplySent).toBe(false);

      const failedMsg = await prisma.message.findUnique({
        where: { id: result.outboundMessageId }
      });
      expect(failedMsg?.status).toBe('FAILED');
      expect(failedMsg?.errorMessage).toContain('Sessão yeshua-prod desconectada');

      const auditLog = await prisma.auditLog.findFirst({
        where: { organizationId: tenantA.id, action: 'AI_PROVIDER_FAILED' },
        orderBy: { createdAt: 'desc' }
      });
      expect(auditLog).not.toBeNull();
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = origFactory;
      await prisma.organizationSettings.update({
        where: { organizationId: tenantA.id },
        data: { aiAutopilotEnabled: false }
      });
    }
  });

  // =========================================================================
  // CENÁRIO 16: Tenant A nunca acessa memória Tenant B
  // =========================================================================
  it('16. Isolamento estrito: Tenant A nunca tem acesso à memória de conversas do Tenant B', async () => {
    // 1. Cria conversa e memória no Tenant B
    const convB = await prisma.conversation.create({
      data: {
        organizationId: tenantB.id,
        personId: personB.id,
        status: 'OPEN'
      }
    });

    await prisma.conversationMemory.create({
      data: {
        organizationId: tenantB.id,
        personId: personB.id,
        conversationId: convB.id,
        summary: 'Dados confidenciais exclusivos do Tenant B',
        factsJson: JSON.stringify({ segredoTenantB: 'CONFIDENCIAL_123' }),
        openItemsJson: '[]',
        preferencesJson: '{}'
      }
    });

    // 2. Busca contexto no Tenant A para a mesma conversa -> deve criar novo registro de Tenant A ou lançar
    const memA = await prisma.conversationMemory.findFirst({
      where: {
        organizationId: tenantA.id,
        summary: { contains: 'CONFIDENCIAL_123' }
      }
    });
    expect(memA).toBeNull();

    // 3. Verifica query tenant-isolated via ConversationMemoryService
    const convA = await prisma.conversation.create({
      data: {
        organizationId: tenantA.id,
        personId: personA.id,
        status: 'OPEN'
      }
    });

    const contextA = await ConversationMemoryService.loadContext(
      tenantA.id,
      personA.id,
      convA.id
    );
    expect(contextA.organizationId).toBe(tenantA.id);
    expect(contextA.facts.segredoTenantB).toBeUndefined();
  });

  // =========================================================================
  // CENÁRIO 17: aiAutopilotEnabled=false -> Somente sugestão
  // =========================================================================
  it('17. Quando aiAutopilotEnabled=false, o sistema deve gerar sugestão sem enviar automaticamente', async () => {
    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: false }
    });

    const aiService = createMockRealAI(() => ({
      reply: 'Esta é uma sugestão que deve aguardar operador humano.',
      decision: 'AUTO_REPLY'
    }));

    const useCase = new ProcessInboundMessageUseCase(aiService);
    const result = await useCase.execute({
      organizationId: tenantA.id,
      fromPhone: personA.phone,
      text: 'Qual o valor da mensalidade?',
      providerMessageId: `inbound_c17_${Date.now()}`
    });

    expect(result.autoReplySent).toBe(false);
    expect(result.classification?.suggestedReply).toContain('aguardar operador humano');

    const auditLog = await prisma.auditLog.findFirst({
      where: { organizationId: tenantA.id, action: 'AI_REPLY_GENERATED' },
      orderBy: { createdAt: 'desc' }
    });
    expect(auditLog).not.toBeNull();
  });

  // =========================================================================
  // CENÁRIO 18: aiAutopilotEnabled=true -> Envio automático quando permitido
  // =========================================================================
  it('18. Quando aiAutopilotEnabled=true e condições atendidas, o envio automático é executado com sucesso', async () => {
    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: { aiAutopilotEnabled: true, aiAutoReplyMinConfidence: 0.8 }
    });

    const realGpnId = `gpn_autopilot_success_${Date.now()}`;
    const origFactory = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => createMockGpnProvider(realGpnId) as any;

    try {
      const aiService = createMockRealAI(() => ({
        reply: 'Sim! Enviamos seu informe de rendimentos imediatamente.',
        confidence: 0.96,
        riskLevel: 'LOW',
        decision: 'AUTO_REPLY'
      }));

      const useCase = new ProcessInboundMessageUseCase(aiService);
      const result = await useCase.execute({
        organizationId: tenantA.id,
        fromPhone: personA.phone,
        text: 'Vocês podem me enviar o informe de rendimentos?',
        providerMessageId: `inbound_c18_${Date.now()}`
      });

      expect(result.autoReplySent).toBe(true);
      expect(result.outboundMessageId).toBeDefined();

      const outbound = await prisma.message.findUnique({
        where: { id: result.outboundMessageId }
      });
      expect(outbound?.status).toBe('SENT');
      expect(outbound?.providerMessageId).toBe(realGpnId);

      const conv = await prisma.conversation.findUnique({
        where: { id: result.conversationId }
      });
      expect(conv?.requiresHumanAttention).toBe(false);
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = origFactory;
      await prisma.organizationSettings.update({
        where: { organizationId: tenantA.id },
        data: { aiAutopilotEnabled: false }
      });
    }
  });

  // =========================================================================
  // CENÁRIO 19: Tenant configurado GEMINI usa Gemini
  // =========================================================================
  it('19. Tenant configurado com aiProvider=GEMINI resolve GeminiAIProvider com o modelo especificado', async () => {
    process.env.GEMINI_API_KEY = 'mock_gemini_key_for_test';

    await prisma.organizationSettings.update({
      where: { organizationId: tenantA.id },
      data: {
        aiProvider: 'GEMINI',
        aiModel: 'gemini-2.0-flash'
      }
    });

    const providerName = await AIProviderFactory.getProviderNameForOrganization(tenantA.id);
    expect(providerName).toBe('GEMINI');

    const providerInstance = await AIProviderFactory.getProviderForOrganization(tenantA.id);
    expect(providerInstance.providerName).toBe('GEMINI');
    expect(providerInstance.modelName).toBe('gemini-2.0-flash');
  });

  // =========================================================================
  // CENÁRIO 20: Alteração futura para DEEPSEEK não exige mudança no GPN
  // =========================================================================
  it('20. Alteração para aiProvider=DEEPSEEK funciona de forma desacoplada sem alterar o GPN', async () => {
    process.env.DEEPSEEK_API_KEY = 'mock_deepseek_key_for_test';

    await prisma.organizationSettings.update({
      where: { organizationId: tenantB.id },
      data: {
        aiProvider: 'DEEPSEEK',
        aiModel: 'deepseek-chat',
        encryptedDeepSeekKey: CryptoService.encrypt('ds_secret_key_123')
      }
    });

    // 1. Resolve provedor de IA via AIProviderFactory (retorna DeepSeek)
    const aiProvider = await AIProviderFactory.getProviderForOrganization(tenantB.id);
    expect(aiProvider.providerName).toBe('DEEPSEEK');
    expect(aiProvider.modelName).toBe('deepseek-chat');

    // 2. GPN permanece 100% inalterado e desacoplado, lidando exclusivamente com transporte
    const gpnProvider = await WhatsAppProviderFactory.getProviderForOrganization(tenantA.id);
    expect(gpnProvider).toBeDefined();
    // GPN não tem nenhuma propriedade ou conhecimento de IA
    expect((gpnProvider as any).aiProvider).toBeUndefined();
    expect((gpnProvider as any).generateAccountingReply).toBeUndefined();
  });

  // =========================================================================
  // CENÁRIO 21: Provider indisponível não provoca fallback externo silencioso
  // =========================================================================
  it('21. Se o provedor configurado falhar/estiver sem credencial, NUNCA há fallback externo silencioso', async () => {
    // Cria org com DeepSeek mas sem nenhuma chave configurada (nem banco nem env)
    const suffix = Date.now().toString(36);
    const noKeyOrg = await prisma.organization.create({
      data: {
        name: `Org Sem Chave ${suffix}`,
        slug: `org-no-key-${suffix}`,
        settings: {
          create: {
            aiProvider: 'DEEPSEEK',
            encryptedDeepSeekKey: null
          }
        }
      }
    });

    const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    try {
      // AIProviderFactory DEVE lançar erro e recusar trocar silenciosamente para Gemini
      await expect(
        AIProviderFactory.getProviderForOrganization(noKeyOrg.id)
      ).rejects.toThrow('Fallback silencioso para outros provedores é terminantemente proibido');

      // E o CompositeAIService faz fail-safe para HUMAN_ESCALATION
      const compositeAI = new CompositeAIService();
      const replyResult = await compositeAI.generateAccountingReply({
        organization: { id: noKeyOrg.id, name: noKeyOrg.name },
        person: { id: 'p1', name: 'Cliente', normalizedPhone: '+5511999990000' },
        memory: { summary: '', facts: {}, openItems: [], preferences: {} },
        recentMessages: [],
        inboundMessage: { id: 'm1', text: 'Olá', receivedAt: new Date() }
      });

      expect(replyResult.decision).toBe('HUMAN_ESCALATION');
      expect(replyResult.providerUsed).toBe('NONE');
    } finally {
      if (originalDeepSeekKey) process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
      await prisma.organizationSettings.deleteMany({ where: { organizationId: noKeyOrg.id } });
      await prisma.organization.delete({ where: { id: noKeyOrg.id } }).catch(() => {});
    }
  });

  // =========================================================================
  // CENÁRIO 22: Yeshua permanece GEMINI neste milestone
  // =========================================================================
  it('22. O tenant Yeshua permanece estritamente configurado com GEMINI por padrão neste milestone', async () => {
    const providerName = await AIProviderFactory.getProviderNameForOrganization(tenantA.id);
    expect(providerName).toBe('GEMINI');

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: tenantA.id }
    });
    expect(settings?.aiProvider).toBe('GEMINI');
  });
});
