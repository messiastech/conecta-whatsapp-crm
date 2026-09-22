import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import http from 'http';

process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

import { buildApp } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { IWhatsAppProvider } from '../src/domain/ports/whatsapp-provider.port.js';

const GPN_SECRET = 'gpn_p0_stability_secret_32_bytes_len!!';

function computeGpnSignature(secret: string, timestamp: number, eventId: string, rawBody: string): string {
  const message = `${timestamp}.${eventId}.${rawBody}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

async function sendGpnWebhook(
  baseUrl: string,
  opts: {
    event: string;
    eventId: string;
    tenantId: string;
    sessionId?: string;
    data: any;
    secret: string;
    timestamp?: number;
  }
) {
  const timestamp = opts.timestamp ?? Date.now();
  const eventId = opts.eventId;
  const envelope = {
    eventId,
    timestamp,
    event: opts.event,
    tenantId: opts.tenantId,
    sessionId: opts.sessionId || 'default',
    data: opts.data
  };
  const rawBody = JSON.stringify(envelope);
  const signature = `sha256=${computeGpnSignature(opts.secret, timestamp, eventId, rawBody)}`;

  return fetch(`${baseUrl}/api/webhooks/gpn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gpn-event': opts.event,
      'x-gpn-event-id': eventId,
      'x-gpn-timestamp': String(timestamp),
      'x-gpn-signature': signature
    },
    body: rawBody
  });
}

describe('P0 Produção — Estabilidade GPN, Identidade LID e Status de Envio no CRM', () => {
  let server: http.Server;
  let baseUrl: string;
  let org: any;
  let user: any;
  let authToken: string;

  beforeAll(async () => {
    const { app } = buildApp();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const orgSuffix = Date.now().toString(36);
    org = await prisma.organization.create({
      data: {
        name: `Org P0 Stability ${orgSuffix}`,
        slug: `org-p0-${orgSuffix}`,
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING' }),
        gpnConnection: {
          create: {
            apiUrl: 'http://localhost:3000',
            encryptedApiKey: CryptoService.encrypt('gpn_api_key_test_12345'),
            sessionId: `session_p0_${orgSuffix}`,
            encryptedWebhookSecret: CryptoService.encrypt(GPN_SECRET),
            status: 'CONNECTED',
            isActive: true
          }
        }
      }
    });
  });

  afterAll(async () => {
    if (org?.id) {
      await prisma.message.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await prisma.conversation.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await prisma.gpnWebhookEvent.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await prisma.gpnConnection.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await prisma.person.deleteMany({ where: { organizationId: org.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. @lid nunca deve virar número de telefone falso no CRM; identidade não resolvida marca IDENTITY_UNRESOLVED', async () => {
    const eventId = `evt_lid_unresolved_${Date.now()}`;
    const res = await sendGpnWebhook(baseUrl, {
      event: 'message.inbound',
      eventId,
      tenantId: org.id,
      secret: GPN_SECRET,
      data: {
        messageId: `msg_lid_${Date.now()}`,
        remoteJid: '123456789012345@lid',
        senderJid: '123456789012345@lid',
        senderLid: '123456789012345@lid',
        senderPhone: null, // Não foi possível resolver o PN
        text: 'Olá, sou um contato com LID restrito',
        pushName: 'Contato LID'
      }
    });

    expect(res.status).toBe(200);

    // Aguarda processamento em background
    await new Promise((r) => setTimeout(r, 500));

    // NENHUMA pessoa deve ter sido criada com telefone falso +123456789012345
    const fakePerson = await prisma.person.findFirst({
      where: {
        organizationId: org.id,
        phone: { contains: '123456789012345' }
      }
    });
    expect(fakePerson).toBeNull();

    // Deve haver um AuditLog com a ação IDENTITY_UNRESOLVED
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: org.id,
        action: 'IDENTITY_UNRESOLVED'
      }
    });
    expect(audit).not.toBeNull();
    expect(audit?.details).toContain('123456789012345@lid');
  });

  it('2. Inbound com senderPhone resolvido pelo GPN cria contato com o telefone real correto', async () => {
    const eventId = `evt_lid_resolved_${Date.now()}`;
    const res = await sendGpnWebhook(baseUrl, {
      event: 'message.inbound',
      eventId,
      tenantId: org.id,
      secret: GPN_SECRET,
      data: {
        messageId: `msg_lid_pn_${Date.now()}`,
        remoteJid: '99887766554433@lid',
        senderJid: '99887766554433@lid',
        senderLid: '99887766554433@lid',
        senderPhone: '+5511999997777', // Resolvido pelo GPN
        text: 'Olá, pergunta sobre obrigações acessórias',
        pushName: 'Pastor Marcos'
      }
    });

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 600));

    // Contato criado com o telefone real
    const person = await prisma.person.findFirst({
      where: {
        organizationId: org.id,
        normalizedPhone: '+5511999997777'
      }
    });
    expect(person).not.toBeNull();
    expect(person?.normalizedPhone).toBe('+5511999997777');
  });

  it('3. Resposta de operador quando GPN falha: persiste FAILED, armazena errorMessage e retorna HTTP 502 (nunca HTTP 201 falso)', async () => {
    // Cria pessoa e conversa
    const person = await prisma.person.create({
      data: {
        organizationId: org.id,
        name: 'Membro Teste Envio',
        phone: '+5511988880000',
        normalizedPhone: '+5511988880000'
      }
    });

    const conversation = await prisma.conversation.create({
      data: {
        organizationId: org.id,
        personId: person.id,
        status: 'OPEN'
      }
    });

    // Mock do provedor retornando falha (ex: sessão GPN desconectada)
    const mockFailingProvider: IWhatsAppProvider = {
      sendTextMessage: async () => ({
        success: false,
        messageId: '',
        recipientPhone: person.normalizedPhone,
        provider: 'GPN',
        status: 'FAILED',
        timestamp: new Date(),
        errorMessage: 'Sessão yeshua-prod-test não está conectada ao WhatsApp.'
      }),
      sendTemplateMessage: async () => ({
        success: false,
        messageId: '',
        recipientPhone: person.normalizedPhone,
        provider: 'GPN',
        status: 'FAILED',
        timestamp: new Date()
      }),
      verifyWebhook: () => null,
      validateSignature: () => true,
      parseWebhookPayload: () => ({ messages: [], statuses: [] })
    };

    // Chamada direta ao endpoint /api/conversations/:id/reply com o controller utilizando mockFailingProvider
    const { ConversationsController } = await import('../src/presentation/controllers/conversations.controller.js');
    const controller = new ConversationsController(mockFailingProvider);

    let statusCode = 0;
    let jsonBody: any = null;

    const fakeReq: any = {
      organizationId: org.id,
      params: { id: conversation.id },
      body: { text: 'Tentando responder enquanto offline' }
    };

    const fakeRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      }
    };

    // Override temporário do factory para injetar o provider que falha
    const { WhatsAppProviderFactory } = await import('../src/infrastructure/whatsapp/whatsapp-provider.factory.js');
    const originalGetProvider = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => mockFailingProvider;

    try {
      await controller.reply(fakeReq, fakeRes);

      // REGRA: HTTP 502 indicando claramente falha de entrega
      expect(statusCode).toBe(502);
      expect(jsonBody?.error).toBe('OUTBOUND_SEND_FAILED');
      expect(jsonBody?.sendResult?.success).toBe(false);

      // Mensagem DEVE estar persistida no banco com status FAILED e o errorMessage
      const savedMsg = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: 'OUTBOUND'
        }
      });
      expect(savedMsg).not.toBeNull();
      expect(savedMsg?.status).toBe('FAILED');
      expect(savedMsg?.errorMessage).toContain('não está conectada ao WhatsApp');
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = originalGetProvider;
    }
  });

  it('4. Retry de mensagem FAILED: após reconexão, atualiza a mensagem para SENT e retorna HTTP 200', async () => {
    const person = await prisma.person.create({
      data: {
        organizationId: org.id,
        name: 'Contato Para Retry',
        phone: '+5511977770000',
        normalizedPhone: '+5511977770000'
      }
    });

    const conversation = await prisma.conversation.create({
      data: {
        organizationId: org.id,
        personId: person.id,
        status: 'OPEN'
      }
    });

    // Mensagem existente previamente falhada
    const failedMsg = await prisma.message.create({
      data: {
        organizationId: org.id,
        conversationId: conversation.id,
        personId: person.id,
        direction: 'OUTBOUND',
        content: 'Mensagem que falhou antes',
        status: 'FAILED',
        errorMessage: 'Connection lost'
      }
    });

    // Provedor que agora recuperou conexão e tem sucesso
    const mockSuccessProvider: IWhatsAppProvider = {
      sendTextMessage: async () => ({
        success: true,
        messageId: 'BAILEYS_RETRY_MSG_777',
        recipientPhone: person.normalizedPhone,
        provider: 'GPN',
        status: 'SENT',
        timestamp: new Date()
      }),
      sendTemplateMessage: async () => ({
        success: true,
        messageId: 'BAILEYS_RETRY_MSG_777',
        recipientPhone: person.normalizedPhone,
        provider: 'GPN',
        status: 'SENT',
        timestamp: new Date()
      }),
      verifyWebhook: () => null,
      validateSignature: () => true,
      parseWebhookPayload: () => ({ messages: [], statuses: [] })
    };

    const { ConversationsController } = await import('../src/presentation/controllers/conversations.controller.js');
    const controller = new ConversationsController(mockSuccessProvider);

    let statusCode = 0;
    let jsonBody: any = null;

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
        jsonBody = data;
        return this;
      }
    };

    const { WhatsAppProviderFactory } = await import('../src/infrastructure/whatsapp/whatsapp-provider.factory.js');
    const originalGetProvider = WhatsAppProviderFactory.getProviderForOrganization;
    WhatsAppProviderFactory.getProviderForOrganization = async () => mockSuccessProvider;

    try {
      await controller.retry(fakeReq, fakeRes);

      expect(statusCode).toBe(200);
      expect(jsonBody?.sendResult?.success).toBe(true);

      // No banco, a mensagem agora deve estar como SENT com novo providerMessageId e sem errorMessage
      const updatedMsg = await prisma.message.findUnique({
        where: { id: failedMsg.id }
      });
      expect(updatedMsg?.status).toBe('SENT');
      expect(updatedMsg?.providerMessageId).toBe('BAILEYS_RETRY_MSG_777');
      expect(updatedMsg?.errorMessage).toBeNull();
    } finally {
      WhatsAppProviderFactory.getProviderForOrganization = originalGetProvider;
    }
  });

  it('5. Webhook duplicado no CRM não duplica mensagem nem evento', async () => {
    const eventId = `evt_dup_test_${Date.now()}`;
    const payload = {
      event: 'message.inbound',
      eventId,
      tenantId: org.id,
      secret: GPN_SECRET,
      data: {
        messageId: `msg_dup_${Date.now()}`,
        remoteJid: '5511999991111@s.whatsapp.net',
        senderJid: '5511999991111@s.whatsapp.net',
        senderPhone: '+5511999991111',
        text: 'Mensagem para teste de deduplicação',
        pushName: 'Teste Dup'
      }
    };

    // 1º envio: deve ser recebido normalmente
    const res1 = await sendGpnWebhook(baseUrl, payload);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.received).toBe(true);
    expect(body1.duplicate).toBeUndefined();

    // 2º envio com o mesmo eventId: idempotência acionada
    const res2 = await sendGpnWebhook(baseUrl, payload);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.received).toBe(true);
    expect(body2.duplicate).toBe(true);
  });
});
