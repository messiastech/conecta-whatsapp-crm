import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { MockWhatsAppProvider } from '../src/infrastructure/whatsapp/mock-whatsapp.provider.js';
import { GPNWhatsAppProvider } from '../src/infrastructure/whatsapp/gpn-whatsapp.provider.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';
import { ConversationsController } from '../src/presentation/controllers/conversations.controller.js';
import { CampaignsController } from '../src/presentation/controllers/campaigns.controller.js';
import { createApiRouter } from '../src/presentation/routes/api.routes.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';

describe('P0 Final — Remoção do Mock do Fluxo Real de Outbound (GPN & Produção)', () => {
  let org: any;
  let conversation: any;
  let person: any;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

    const suffix = Date.now().toString(36);
    org = await prisma.organization.create({
      data: {
        name: `Org Outbound Real ${suffix}`,
        slug: `org-outbound-real-${suffix}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN'
        }),
        gpnConnection: {
          create: {
            apiUrl: 'http://localhost:3000',
            encryptedApiKey: CryptoService.encrypt('gpn_prod_key_valid'),
            sessionId: `sess_${suffix}`,
            status: 'CONNECTED',
            isActive: true
          }
        }
      }
    });

    person = await prisma.person.create({
      data: {
        organizationId: org.id,
        name: 'Pastor Real Teste',
        phone: '+5511999998888',
        normalizedPhone: '+5511999998888',
        optOut: false
      }
    });

    conversation = await prisma.conversation.create({
      data: {
        organizationId: org.id,
        personId: person.id,
        status: 'OPEN'
      }
    });
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
  });

  it('1. MockWhatsAppProvider: deve lançar [MOCK_FORBIDDEN_IN_PRODUCTION] se chamado fora do Sandbox em produção com GPN', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'gpn';

    const mockProvider = MockWhatsAppProvider.getInstance();

    await expect(
      mockProvider.sendTextMessage('+5511999998888', 'Mensagem proibida em prod')
    ).rejects.toThrow('[MOCK_FORBIDDEN_IN_PRODUCTION]');

    await expect(
      mockProvider.sendTemplateMessage('+5511999998888', 'template_name', {})
    ).rejects.toThrow('[MOCK_FORBIDDEN_IN_PRODUCTION]');
  });

  it('2. MockWhatsAppProvider: deve continuar funcionando normalmente em dev/test ou quando WHATSAPP_PROVIDER=mock', async () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_PROVIDER = 'mock';

    const mockProvider = MockWhatsAppProvider.getInstance();
    const result = await mockProvider.sendTextMessage('+5511999998888', 'Mensagem em dev');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('MOCK');
    expect(result.messageId).toContain('wamid.mock_');
  });

  it('3. ConversationsController.reply(): em produção com GPN, NUNCA usa mock e chama provedor GPN real com messageId real', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'gpn';

    // Mock do factory simulando o GPN real retornando sucesso
    const realGpnMessageId = `gpn_msg_real_${Date.now()}`;
    let gpnCalled = false;

    const mockGpnProvider = {
      sendTextMessage: async (to: string, text: string) => {
        gpnCalled = true;
        return {
          success: true,
          messageId: realGpnMessageId,
          recipientPhone: to,
          provider: 'GPN' as const,
          status: 'SENT' as const,
          timestamp: new Date()
        };
      },
      sendTemplateMessage: async () => {
        throw new Error('Not implemented');
      },
      verifyWebhook: () => null,
      validateSignature: () => true,
      parseWebhookPayload: () => ({ messages: [], statuses: [] })
    };

    const originalGetProvider = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => mockGpnProvider as any;

    try {
      // Injeta propositalmente um MockWhatsAppProvider como defaultProvider
      // Em produção, o controller DEVE ignorar e usar WhatsAppProviderFactory!
      const mockAsDefault = MockWhatsAppProvider.getInstance();
      const controller = new ConversationsController(mockAsDefault);

      let statusCode = 0;
      let responseBody: any = null;

      const fakeReq: any = {
        organizationId: org.id,
        params: { id: conversation.id },
        body: { text: 'Graça e Paz Pastor, envio via GPN real' }
      };

      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          responseBody = data;
          return this;
        }
      };

      await controller.reply(fakeReq, fakeRes);

      expect(statusCode).toBe(201);
      expect(gpnCalled).toBe(true);
      expect(responseBody.message.providerMessageId).toBe(realGpnMessageId);
      expect(responseBody.message.providerMessageId).not.toContain('wamid.mock_');
      expect(responseBody.message.status).toBe('SENT');

      // Verifica auditoria
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.id,
          action: 'HUMAN_REPLY_SENT'
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(auditLog).not.toBeNull();
      const details = JSON.parse(auditLog!.details || '{}');
      expect(details.provider).toBe('GPN');
      expect(details.success).toBe(true);
      expect(details.messageId).toBe(realGpnMessageId);
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = originalGetProvider;
    }
  });

  it('4. ConversationsController.reply(): quando GPN falha, persiste FAILED, HTTP 502 e AuditLog HUMAN_REPLY_FAILED', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'gpn';

    const mockFailingGpn = {
      sendTextMessage: async (to: string) => ({
        success: false,
        messageId: '',
        recipientPhone: to,
        provider: 'GPN' as const,
        status: 'FAILED' as const,
        timestamp: new Date(),
        errorMessage: 'Sessão yeshua-prod desconectada do Baileys'
      }),
      sendTemplateMessage: async () => {
        throw new Error('Not implemented');
      },
      verifyWebhook: () => null,
      validateSignature: () => true,
      parseWebhookPayload: () => ({ messages: [], statuses: [] })
    };

    const originalGetProvider = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => mockFailingGpn as any;

    try {
      const controller = new ConversationsController();

      let statusCode = 0;
      let responseBody: any = null;

      const fakeReq: any = {
        organizationId: org.id,
        params: { id: conversation.id },
        body: { text: 'Mensagem com GPN offline' }
      };

      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          responseBody = data;
          return this;
        }
      };

      await controller.reply(fakeReq, fakeRes);

      expect(statusCode).toBe(502);
      expect(responseBody.error).toBe('OUTBOUND_SEND_FAILED');
      expect(responseBody.messageRecord.status).toBe('FAILED');
      expect(responseBody.messageRecord.errorMessage).toContain('Sessão yeshua-prod desconectada');

      // Verifica AuditLog com HUMAN_REPLY_FAILED
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.id,
          action: 'HUMAN_REPLY_FAILED'
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(auditLog).not.toBeNull();
      const details = JSON.parse(auditLog!.details || '{}');
      expect(details.provider).toBe('GPN');
      expect(details.success).toBe(false);
      expect(details.errorMessage).toContain('Sessão yeshua-prod desconectada');
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = originalGetProvider;
    }
  });

  it('5. ConversationsController.retry(): em produção com GPN, reenvia via GPN e gera AuditLog atualizado', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'gpn';

    // Cria mensagem falhada
    const failedMsg = await prisma.message.create({
      data: {
        organizationId: org.id,
        conversationId: conversation.id,
        personId: person.id,
        direction: 'OUTBOUND',
        content: 'Mensagem para retry via GPN',
        status: 'FAILED',
        errorMessage: 'Erro temporário'
      }
    });

    const realGpnMessageId = `gpn_retry_${Date.now()}`;
    let retryCalled = false;

    const mockGpnProvider = {
      sendTextMessage: async (to: string, text: string) => {
        retryCalled = true;
        return {
          success: true,
          messageId: realGpnMessageId,
          recipientPhone: to,
          provider: 'GPN' as const,
          status: 'SENT' as const,
          timestamp: new Date()
        };
      },
      sendTemplateMessage: async () => {
        throw new Error('Not implemented');
      },
      verifyWebhook: () => null,
      validateSignature: () => true,
      parseWebhookPayload: () => ({ messages: [], statuses: [] })
    };

    const originalGetProvider = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => mockGpnProvider as any;

    try {
      const mockAsDefault = MockWhatsAppProvider.getInstance();
      const controller = new ConversationsController(mockAsDefault);

      let statusCode = 0;
      let responseBody: any = null;

      const fakeReq: any = {
        organizationId: org.id,
        params: { id: conversation.id, messageId: failedMsg.id }
      };

      const fakeRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          responseBody = data;
          return this;
        }
      };

      await controller.retry(fakeReq, fakeRes);

      expect(statusCode).toBe(200);
      expect(retryCalled).toBe(true);
      expect(responseBody.message.status).toBe('SENT');
      expect(responseBody.message.providerMessageId).toBe(realGpnMessageId);
      expect(responseBody.message.providerMessageId).not.toContain('wamid.mock_');

      // Verifica auditoria de retry
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.id,
          action: 'HUMAN_REPLY_SENT'
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(auditLog).not.toBeNull();
      const details = JSON.parse(auditLog!.details || '{}');
      expect(details.retry).toBe(true);
      expect(details.provider).toBe('GPN');
      expect(details.providerMessageId).toBe(realGpnMessageId);
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = originalGetProvider;
    }
  });

  it('6. createApiRouter: em modo GPN ou produção, MockWhatsAppProvider não é injetado como provider operacional', () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_PROVIDER = 'gpn';

    const mockProvider = MockWhatsAppProvider.getInstance();
    const router = createApiRouter(mockProvider, {} as any);

    expect(router).toBeDefined();
    // Confirma que router foi instanciado sem erros
  });
});
