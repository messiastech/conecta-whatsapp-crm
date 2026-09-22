import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { buildApp } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { WhatsAppLifecycleService } from '../src/application/services/whatsapp-lifecycle.service.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';
import { GPNWhatsAppProvider } from '../src/infrastructure/whatsapp/gpn-whatsapp.provider.js';

/**
 * WhatsApp GPN Lifecycle & Operations Suite (12 E2E Specs)
 *
 * Diretriz Definitiva de Mensageria:
 * 1. GPN = PRIMARY & PADRÃO
 * 2. Meta = Provedor Excepcional de Contingência (sem fallback automático)
 * 3. Proibição Absoluta de Fallback Silencioso GPN -> Meta
 * 4. UX Transparente e Limpa (Configurações -> WhatsApp)
 * 5. Pareamento Único com Persistência
 * 6. Substituição Segura de Número com 100% de Preservação de Histórico
 *
 * 12 Cenários E2E:
 *  1. POST /api/organization/whatsapp/connect (criação e provisionamento de sessão)
 *  2. GET /api/organization/whatsapp/status (obtenção de QR code no estado AGUARDANDO_QR)
 *  3. Webhook session.status: connected -> transição para CONECTADO com telefone
 *  4. Verificação de persistência após reload/restart (sem necessidade de re-scan)
 *  5. Inbound message via POST /api/webhooks/gpn (message.inbound) com HMAC
 *  6. Outbound message via GPNWhatsAppProvider.sendTextMessage (envio via GPN)
 *  7. Webhook message.ack -> atualização de status (DELIVERED e READ com timestamps)
 *  8. DELETE /api/organization/whatsapp/disconnect -> transição para DESCONECTADO e auditoria
 *  9. POST /api/organization/whatsapp/reconnect -> solicitação de reconexão de sessão
 * 10. POST /api/organization/whatsapp/replace -> substituição com confirmação e auditoria
 * 11. Preservação integral de histórico após substituição de número
 * 12. Ausência comprovada de fallback automático para a Meta em caso de falha do GPN
 */

const TEST_GPN_API_KEY = 'gpn_e2e_test_api_key_32bytes_long!';
const TEST_GPN_WEBHOOK_SECRET = 'gpn_e2e_test_webhook_secret_32bytes!';

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

describe('WhatsApp GPN Lifecycle & Operations Suite (12 E2E Specs)', () => {
  let appServer: http.Server;
  let gpnMockServer: http.Server;
  let baseUrl: string;
  let gpnMockUrl: string;
  let churchOrgId: string;
  let churchUserId: string;
  let userCookie: string;
  const outboundCalls: any[] = [];

  const parseCookieHeader = (res: any) => {
    if (typeof res.headers.getSetCookie === 'function') {
      const cookies = res.headers.getSetCookie();
      return cookies.map((c: string) => c.split(';')[0].trim()).join('; ');
    }
    const raw = res.headers.get('set-cookie') || '';
    return raw
      .split(',')
      .map((c: string) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  };

  beforeAll(async () => {
    // 1. Inicia Mock Server do GPN Core Gateway
    gpnMockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const url = req.url || '';
        const method = req.method;
        res.setHeader('content-type', 'application/json');

        if (url === '/api/v1/sessions' && method === 'POST') {
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            status: 'WAITING_QR',
            qr: '2@gpn_e2e_test_mock_qr_string_abc123'
          }));
          return;
        }

        if (url.includes('/reconnect') && method === 'POST') {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, status: 'connecting' }));
          return;
        }

        if (url.startsWith('/api/v1/sessions/') && method === 'DELETE') {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, status: 'disconnected' }));
          return;
        }

        if (url === '/api/v1/messages/text' && method === 'POST') {
          const parsed = JSON.parse(body || '{}');
          outboundCalls.push(parsed);
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            messageId: `GPN_MSG_OUT_${Date.now()}`
          }));
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not_found' }));
      });
    });

    await new Promise<void>((resolve) => {
      gpnMockServer.listen(0, '127.0.0.1', () => resolve());
    });
    const gpnAddr = gpnMockServer.address() as any;
    gpnMockUrl = `http://127.0.0.1:${gpnAddr.port}`;

    // 2. Inicia servidor Conecta CRM
    const { app } = buildApp();
    appServer = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = appServer.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // 3. Cadastra usuário administrador Yeshua
    const userEmail = `yeshua-admin-${Date.now()}@test.com`;
    const signupRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Admin Yeshua Igrejas',
        email: userEmail,
        password: 'AdminPassword123!'
      })
    });
    userCookie = parseCookieHeader(signupRes);
    const dbUser = await prisma.user.findUnique({ where: { email: userEmail } });
    churchUserId = dbUser!.id;

    // 4. Cria Organização Yeshua Igrejas com GPN
    const org = await prisma.organization.create({
      data: {
        name: 'Yeshua Contabilidade Eclesiástica',
        slug: `yeshua-e2e-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN',
          brandName: 'YESHUA DESK IGREJAS',
          brandSubtitle: 'Contabilidade Especializada para Igrejas'
        }),
        members: {
          create: {
            userId: churchUserId,
            role: 'OWNER'
          }
        },
        settings: {
          create: { timezone: 'America/Sao_Paulo', language: 'pt-BR', aiProvider: 'LOCAL_FALLBACK' }
        },
        gpnConnection: {
          create: {
            apiUrl: gpnMockUrl,
            sessionId: `sess-yeshua-${Date.now()}`,
            encryptedApiKey: CryptoService.encrypt(TEST_GPN_API_KEY),
            encryptedWebhookSecret: CryptoService.encrypt(TEST_GPN_WEBHOOK_SECRET),
            isActive: true,
            status: 'DISCONNECTED'
          }
        }
      }
    });
    churchOrgId = org.id;
  }, 60000);

  afterAll(async () => {
    if (appServer) await new Promise<void>((resolve) => appServer.close(() => resolve()));
    if (gpnMockServer) await new Promise<void>((resolve) => gpnMockServer.close(() => resolve()));

    try {
      if (churchOrgId) {
        await prisma.gpnWebhookEvent.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.auditLog.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.followUpTask.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.message.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.person.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.gpnConnection.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.organization.delete({ where: { id: churchOrgId } }).catch(() => {});
      }
      if (churchUserId) {
        await prisma.user.delete({ where: { id: churchUserId } }).catch(() => {});
      }
    } catch {}
  });

  // 1. POST /api/organization/whatsapp/connect
  it('1. POST /api/organization/whatsapp/connect deve iniciar sessão no GPN e retornar estado AGUARDANDO_QR', async () => {
    const res = await fetch(`${baseUrl}/api/organization/whatsapp/connect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': churchOrgId
      }
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;

    expect(json.status).toBe('AGUARDANDO_QR');
    expect(json.provider).toBe('GPN');
    expect(json.qrCode).toBeDefined();
    expect(json.qrCode).toContain('2@gpn_e2e_test_mock_qr_string_abc123');
    expect(json.isOperating).toBe(false);

    // Garante que segredos técnicos internos não vazam na resposta do cliente
    expect(json.apiKey).toBeUndefined();
    expect(json.apiUrl).toBeUndefined();
    expect(json.webhookSecret).toBeUndefined();
  });

  // 2. GET /api/organization/whatsapp/status
  it('2. GET /api/organization/whatsapp/status deve exibir QR Code no estado AGUARDANDO_QR', async () => {
    const res = await fetch(`${baseUrl}/api/organization/whatsapp/status`, {
      method: 'GET',
      headers: {
        cookie: userCookie,
        'x-organization-id': churchOrgId
      }
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;

    expect(json.status).toBe('AGUARDANDO_QR');
    expect(json.qrCode).toBeTruthy();
    expect(json.provider).toBe('GPN');
    expect(json.isOperating).toBe(false);
  });

  // 3. Webhook session.status: connected -> transição para CONECTADO
  it('3. Webhook session.status: connected deve sincronizar status para CONECTADO e salvar número', async () => {
    const eventId = `evt_status_${Date.now()}`;
    const connectedPhone = '+5511998887777';

    const webhookRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId,
      tenantId: churchOrgId,
      data: {
        status: 'connected',
        phone: connectedPhone,
        timestamp: Date.now()
      },
      secret: TEST_GPN_WEBHOOK_SECRET
    });

    expect(webhookRes.status).toBe(200);
    const resJson = await webhookRes.json() as any;
    expect(resJson.received).toBe(true);

    // Consulta status atualizado via API do cliente
    const statusRes = await fetch(`${baseUrl}/api/organization/whatsapp/status`, {
      method: 'GET',
      headers: {
        cookie: userCookie,
        'x-organization-id': churchOrgId
      }
    });

    expect(statusRes.status).toBe(200);
    const channel = await statusRes.json() as any;

    expect(channel.status).toBe('CONECTADO');
    expect(channel.connectedPhone).toBe(connectedPhone);
    expect(channel.connectedAt).toBeTruthy();
    expect(channel.qrCode).toBeNull(); // QR code deve sumir após conexão bem-sucedida
    expect(channel.isOperating).toBe(true);
  });

  // 4. Verificação de persistência após reload/restart
  it('4. Estado CONECTADO e número devem persistir após restart/reinstanciação de serviço', async () => {
    // Simula restart obtendo status diretamente do banco via nova instância do serviço
    const channelInfo = await WhatsAppLifecycleService.getStatus(churchOrgId);

    expect(channelInfo.status).toBe('CONECTADO');
    expect(channelInfo.connectedPhone).toBe('+5511998887777');
    expect(channelInfo.isOperating).toBe(true);
    expect(channelInfo.qrCode).toBeNull();
  });

  // 5. Inbound message via POST /api/webhooks/gpn (message.inbound)
  it('5. Webhook message.inbound com HMAC válido deve criar Person, Conversation e Message', async () => {
    const pastorPhone = '5511987654321';
    const msgId = `GPN_MSG_IN_${Date.now()}`;
    const eventId = `evt_inbound_${Date.now()}`;

    const res = await sendGpnWebhook(baseUrl, {
      event: 'message.inbound',
      eventId,
      tenantId: churchOrgId,
      data: {
        messageId: msgId,
        remoteJid: `${pastorPhone}@s.whatsapp.net`,
        text: 'Paz do Senhor! Preciso regularizar a CND da Receita Federal da Primeira Igreja Batista.',
        pushName: 'Pastor Oliveira',
        timestamp: Date.now(),
        type: 'text',
        fromMe: false
      },
      secret: TEST_GPN_WEBHOOK_SECRET
    });

    expect(res.status).toBe(200);

    // Aguarda o processamento assíncrono do inbound use case
    let person: any = null;
    let message: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      person = await prisma.person.findFirst({
        where: { organizationId: churchOrgId, normalizedPhone: `+${pastorPhone}` }
      });
      message = await prisma.message.findFirst({
        where: { organizationId: churchOrgId, providerMessageId: msgId }
      });
      if (person && message) break;
    }

    expect(person).toBeTruthy();
    expect(person!.normalizedPhone).toBe(`+${pastorPhone}`);

    expect(message).toBeTruthy();
    expect(message!.direction).toBe('INBOUND');
    expect(message!.content).toContain('regularizar a CND da Receita Federal');
  });

  // 6. Outbound message via GPNWhatsAppProvider.sendTextMessage
  it('6. Outbound message via GPN deve enviar texto para o gateway GPN com sucesso', async () => {
    const provider = new GPNWhatsAppProvider({
      apiUrl: gpnMockUrl,
      apiKey: TEST_GPN_API_KEY,
      sessionId: `sess-yeshua-${churchOrgId}`
    });

    const result = await provider.sendTextMessage('+5511987654321', 'Olá Pastor! Segue o protocolo de emissão da sua CND.');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('GPN');
    expect(result.status).toBe('SENT');
    expect(result.recipientPhone).toBe('+5511987654321');
    expect(result.messageId).toBeTruthy();

    expect(outboundCalls.length).toBeGreaterThan(0);
    const lastCall = outboundCalls[outboundCalls.length - 1];
    expect(lastCall.to).toBe('+5511987654321');
    expect(lastCall.text).toContain('protocolo de emissão');
  });

  // 7. Webhook message.ack -> atualização de status (DELIVERED e READ)
  it('7. Webhook message.ack deve atualizar mensagem para DELIVERED e READ com timestamps', async () => {
    // 1. Cria conversa e mensagem OUTBOUND de teste
    const person = await prisma.person.findFirst({ where: { organizationId: churchOrgId } });
    let conversation = await prisma.conversation.findFirst({ where: { organizationId: churchOrgId, personId: person!.id } });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId: churchOrgId,
          personId: person!.id,
          status: 'ACTIVE'
        }
      });
    }

    const testMsgId = `GPN_ACK_TEST_${Date.now()}`;
    await prisma.message.create({
      data: {
        organizationId: churchOrgId,
        conversationId: conversation.id,
        personId: person!.id,
        direction: 'OUTBOUND',
        status: 'SENT',
        providerMessageId: testMsgId,
        content: 'Notificação de entrega e leitura'
      }
    });

    // 2. Envia ACK de DELIVERED
    await sendGpnWebhook(baseUrl, {
      event: 'message.ack',
      eventId: `evt_ack_del_${Date.now()}`,
      tenantId: churchOrgId,
      data: {
        messageId: testMsgId,
        status: 'DELIVERED',
        timestamp: Date.now()
      },
      secret: TEST_GPN_WEBHOOK_SECRET
    });

    let updatedMsg: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      updatedMsg = await prisma.message.findFirst({
        where: { organizationId: churchOrgId, providerMessageId: testMsgId }
      });
      if (updatedMsg?.status === 'DELIVERED') break;
    }
    expect(updatedMsg!.status).toBe('DELIVERED');
    expect(updatedMsg!.deliveredAt).toBeTruthy();

    // 3. Envia ACK de READ
    await sendGpnWebhook(baseUrl, {
      event: 'message.ack',
      eventId: `evt_ack_read_${Date.now()}`,
      tenantId: churchOrgId,
      data: {
        messageId: testMsgId,
        status: 'READ',
        timestamp: Date.now()
      },
      secret: TEST_GPN_WEBHOOK_SECRET
    });

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      updatedMsg = await prisma.message.findFirst({
        where: { organizationId: churchOrgId, providerMessageId: testMsgId }
      });
      if (updatedMsg?.status === 'READ') break;
    }
    expect(updatedMsg!.status).toBe('READ');
    expect(updatedMsg!.readAt).toBeTruthy();
  });

  // 8. DELETE /api/organization/whatsapp/disconnect
  it('8. DELETE /api/organization/whatsapp/disconnect deve desconectar aparelho e registrar auditoria', async () => {
    const res = await fetch(`${baseUrl}/api/organization/whatsapp/disconnect`, {
      method: 'DELETE',
      headers: {
        cookie: userCookie,
        'x-organization-id': churchOrgId
      }
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;

    expect(json.status).toBe('DESCONECTADO');
    expect(json.isOperating).toBe(false);

    // Valida registro de AuditLog
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: churchOrgId,
        action: 'WHATSAPP_DISCONNECTED'
      }
    });
    expect(audit).toBeTruthy();
    expect(audit!.userId).toBe(churchUserId);
  });

  // 9. POST /api/organization/whatsapp/reconnect
  it('9. POST /api/organization/whatsapp/reconnect deve solicitar reconexão da sessão existente', async () => {
    const res = await fetch(`${baseUrl}/api/organization/whatsapp/reconnect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': churchOrgId
      }
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;

    expect(['CONECTANDO', 'CONECTADO']).toContain(json.status);
    expect(json.provider).toBe('GPN');
  });

  // 10. POST /api/organization/whatsapp/replace
  it('10. POST /api/organization/whatsapp/replace deve exigir confirmação e registrar auditoria', async () => {
    // 10a: Sem confirmação -> 400 CONFIRMATION_REQUIRED
    const rejectRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': churchOrgId
      },
      body: JSON.stringify({ confirm: false })
    });
    expect(rejectRes.status).toBe(400);
    const rejectJson = await rejectRes.json() as any;
    expect(rejectJson.error).toBe('CONFIRMATION_REQUIRED');

    // 10b: Com confirmação explícita -> 200, gera nova sessão e novo QR Code
    const replaceRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': churchOrgId
      },
      body: JSON.stringify({
        confirm: true,
        reason: 'Substituição pelo chip exclusivo da Tesouraria Yeshua'
      })
    });

    expect(replaceRes.status).toBe(200);
    const replaceJson = await replaceRes.json() as any;
    expect(replaceJson.status).toBe('AGUARDANDO_QR');
    expect(replaceJson.qrCode).toBeTruthy();

    // Valida registro de AuditLog com motivo e entidades preservadas
    const auditReplace = await prisma.auditLog.findFirst({
      where: {
        organizationId: churchOrgId,
        action: 'WHATSAPP_NUMBER_REPLACED'
      }
    });
    expect(auditReplace).toBeTruthy();
    const details = JSON.parse(auditReplace!.details || '{}');
    expect(details.reason).toContain('Tesouraria Yeshua');
    expect(details.preservedEntities).toContain('conversations');
  });

  // 11. Preservação integral de histórico após substituição de número
  it('11. Preservação integral de clientes, conversas e mensagens após troca de número', async () => {
    const personsCount = await prisma.person.count({ where: { organizationId: churchOrgId } });
    const conversationsCount = await prisma.conversation.count({ where: { organizationId: churchOrgId } });
    const messagesCount = await prisma.message.count({ where: { organizationId: churchOrgId } });

    expect(personsCount).toBeGreaterThan(0);
    expect(conversationsCount).toBeGreaterThan(0);
    expect(messagesCount).toBeGreaterThan(0);
  });

  // 12. Ausência comprovada de fallback automático para a Meta
  it('12. Em indisponibilidade do GPN, deve lançar [GPN_UNAVAILABLE] e NÃO comutar para Meta', async () => {
    // Simula status ERROR no GPN Connection
    await prisma.gpnConnection.update({
      where: { organizationId: churchOrgId },
      data: { status: 'ERROR' }
    });

    // Tenta obter o provedor para a organização Yeshua
    let thrownError: any = null;
    let provider: any = null;

    try {
      provider = await WhatsAppProviderFactory.getProviderForOrganization(churchOrgId);
    } catch (err: any) {
      thrownError = err;
    }

    // Asserções críticas de segurança e conformidade arquitetural:
    expect(provider).toBeNull();
    expect(thrownError).toBeTruthy();
    expect(thrownError.message).toContain('[GPN_UNAVAILABLE]');
    expect(thrownError.message).toContain('Fallback automático para a Meta desativado');

    // Valida que foi gerado um FollowUpTask URGENT de alerta operacional
    const alertTask = await prisma.followUpTask.findFirst({
      where: {
        organizationId: churchOrgId,
        title: { contains: 'Alerta Operacional: GPN Indisponível' },
        priority: 'URGENT'
      }
    });
    expect(alertTask).toBeTruthy();
    expect(alertTask!.description).toContain('interrompido sem fallback automático para a Meta');
  });
});
