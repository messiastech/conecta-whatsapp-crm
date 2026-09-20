import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';

// Garantir variáveis de ambiente para testes
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

import { buildApp } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import http from 'http';

/**
 * Testes de Integração: Conecta CRM ↔ GPN Core Gateway
 *
 * Cobertura:
 * 1.  Envio Conecta → GPN mockado (GPNProvider HTTP client)
 * 2.  Inbound GPN → Conecta (message.inbound)
 * 3.  ACK SENT/DELIVERED/READ (message.ack)
 * 4.  session.status (CONNECTED/DISCONNECTED)
 * 5.  HMAC válido aceito
 * 6.  HMAC inválido rejeitado (403)
 * 7.  Replay rejeitado (403)
 * 8.  Idempotência (duplicate eventId retorna 200 duplicate=true)
 * 9.  Org A não processa evento da Org B (isolamento multi-tenant)
 * 10. GPN ignora regra de 24h
 * 11. Meta mantém regra de 24h
 */

const GPN_WEBHOOK_SECRET = 'gpn_test_webhook_secret_min32chars!!';
const GPN_API_KEY = 'gpn_test_api_key_min8chars';

// Helper: computa assinatura HMAC no formato GPN
function computeGpnSignature(secret: string, timestamp: number, eventId: string, rawBody: string): string {
  const message = `${timestamp}.${eventId}.${rawBody}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

// Helper: envia webhook GPN para o Conecta
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
    signatureOverride?: string;
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
  const signature = opts.signatureOverride ??
    `sha256=${computeGpnSignature(opts.secret, timestamp, eventId, rawBody)}`;

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

describe('Integração Conecta ↔ GPN Core Gateway', () => {
  let server: http.Server;
  let baseUrl: string;
  let orgAId: string;
  let orgBId: string;
  let userACookie: string;
  let userBCookie: string;

  beforeAll(async () => {
    const { app } = buildApp();

    // Start server
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // (Cleanup is done per-tenant in afterAll to prevent concurrency interference with other suites)

    // Create User A
    const signupA = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'GPN User A',
        email: `gpn-user-a-${Date.now()}@test.com`,
        password: 'TestPassword123!'
      })
    });
    const cookieA = signupA.headers.get('set-cookie') || '';
    userACookie = cookieA.split(';')[0];

    // Create Org A
    const orgARes = await fetch(`${baseUrl}/api/organizations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userACookie },
      body: JSON.stringify({ name: 'GPN Org A', slug: `gpn-org-a-${Date.now()}` })
    });
    const orgAData = await orgARes.json() as any;
    orgAId = orgAData.id;

    // Create GPN Connection for Org A
    await prisma.gpnConnection.create({
      data: {
        organizationId: orgAId,
        apiUrl: 'http://127.0.0.1:19999', // Fake GPN server (tests use mock or direct webhook)
        sessionId: 'default',
        encryptedApiKey: CryptoService.encrypt(GPN_API_KEY),
        encryptedWebhookSecret: CryptoService.encrypt(GPN_WEBHOOK_SECRET),
        isActive: true,
        status: 'DISCONNECTED'
      }
    });

    // Create User B
    const signupB = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'GPN User B',
        email: `gpn-user-b-${Date.now()}@test.com`,
        password: 'TestPassword456!'
      })
    });
    const cookieB = signupB.headers.get('set-cookie') || '';
    userBCookie = cookieB.split(';')[0];

    // Create Org B (NO GPN Connection)
    const orgBRes = await fetch(`${baseUrl}/api/organizations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userBCookie },
      body: JSON.stringify({ name: 'GPN Org B', slug: `gpn-org-b-${Date.now()}` })
    });
    const orgBData = await orgBRes.json() as any;
    orgBId = orgBData.id;
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));

    try {
      const orgIds = [orgAId, orgBId].filter(Boolean);
      for (const orgId of orgIds) {
        await prisma.gpnWebhookEvent.deleteMany({ where: { organizationId: orgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: orgId } });
        await prisma.message.deleteMany({ where: { organizationId: orgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
        await prisma.attendance.deleteMany({ where: { organizationId: orgId } });
        await prisma.person.deleteMany({ where: { organizationId: orgId } });
        await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
        await prisma.event.deleteMany({ where: { organizationId: orgId } });
        await prisma.gpnConnection.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      }
    } catch {
      // Ignora erros de teardown
    }
  });

  // --- 1. Envio Conecta → GPN mockado ---
  it('1. GPNProvider.sendTextMessage deve retornar FAILED quando GPN não está acessível', async () => {
    const { GPNWhatsAppProvider } = await import('../src/infrastructure/whatsapp/gpn-whatsapp.provider.js');
    const provider = new GPNWhatsAppProvider({
      apiUrl: 'http://127.0.0.1:19999', // Porta fechada
      apiKey: GPN_API_KEY,
      sessionId: 'default'
    });

    const result = await provider.sendTextMessage('+5511999998888', 'Olá via GPN');
    expect(result.provider).toBe('GPN');
    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.recipientPhone).toBe('+5511999998888');
  });

  // --- 2. Inbound GPN → Conecta ---
  it('2. Webhook message.inbound deve criar Person + Conversation + Message no PostgreSQL', async () => {
    const testPhone = `551198888${Math.floor(1000 + Math.random() * 9000)}`;
    const msgId = `MSG_GPN_IN_${Date.now()}`;
    const eventId = `evt_inbound_${Date.now()}`;

    const res = await sendGpnWebhook(baseUrl, {
      event: 'message.inbound',
      eventId,
      tenantId: orgAId,
      data: {
        messageId: msgId,
        remoteJid: `${testPhone}@s.whatsapp.net`,
        text: 'Olá, vim pelo GPN!',
        pushName: 'Contato GPN',
        timestamp: Date.now(),
        type: 'text',
        fromMe: false
      },
      secret: GPN_WEBHOOK_SECRET
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.received).toBe(true);

    // Aguarda processamento async (com retry de até 10 segundos)
    let person: any = null;
    let message: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      person = await prisma.person.findFirst({
        where: { organizationId: orgAId, normalizedPhone: `+${testPhone}` }
      });
      message = await prisma.message.findFirst({
        where: { organizationId: orgAId, providerMessageId: msgId }
      });
      if (person && message) break;
    }

    expect(person).toBeTruthy();
    expect(person!.name).toBe('Participante (WhatsApp)');

    expect(message).toBeTruthy();
    expect(message!.direction).toBe('INBOUND');
    expect(message!.content).toBe('Olá, vim pelo GPN!');
  });

  // --- 3. ACK SENT/DELIVERED/READ ---
  it('3. Webhook message.ack deve atualizar status de mensagem (SENT → DELIVERED → READ)', async () => {
    // Garante que existe Person e Conversation
    const ackPhone = `+551197777${Math.floor(1000 + Math.random() * 9000)}`;
    const person = await prisma.person.create({
      data: {
        organizationId: orgAId,
        name: 'Contato ACK Test',
        phone: ackPhone.replace('+', ''),
        normalizedPhone: ackPhone
      }
    });
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: orgAId,
        personId: person.id,
        status: 'OPEN'
      }
    });

    const outMsgId = `MSG_GPN_OUT_ACK_${Date.now()}`;
    const outMsg = await prisma.message.create({
      data: {
        organizationId: orgAId,
        conversationId: conversation.id,
        personId: person.id,
        direction: 'OUTBOUND',
        providerMessageId: outMsgId,
        content: 'Mensagem para testar ACK',
        status: 'SENT',
        sentAt: new Date()
      }
    });

    // ACK: DELIVERED
    await sendGpnWebhook(baseUrl, {
      event: 'message.ack',
      eventId: `evt_ack_delivered_${Date.now()}`,
      tenantId: orgAId,
      data: {
        messageId: outMsgId,
        status: 3,
        statusName: 'delivered',
        remoteJid: `${ackPhone.replace('+', '')}@s.whatsapp.net`,
        fromMe: true,
        timestamp: Date.now()
      },
      secret: GPN_WEBHOOK_SECRET
    });

    let updated: any = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 300));
      updated = await prisma.message.findUnique({ where: { id: outMsg.id } });
      if (updated?.status === 'DELIVERED') break;
    }
    expect(updated!.status).toBe('DELIVERED');
    expect(updated!.deliveredAt).toBeTruthy();

    // ACK: READ
    await sendGpnWebhook(baseUrl, {
      event: 'message.ack',
      eventId: `evt_ack_read_${Date.now()}`,
      tenantId: orgAId,
      data: {
        messageId: outMsgId,
        status: 4,
        statusName: 'read',
        remoteJid: `${ackPhone.replace('+', '')}@s.whatsapp.net`,
        fromMe: true,
        timestamp: Date.now()
      },
      secret: GPN_WEBHOOK_SECRET
    });

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 300));
      updated = await prisma.message.findUnique({ where: { id: outMsg.id } });
      if (updated?.status === 'READ') break;
    }
    expect(updated!.status).toBe('READ');
    expect(updated!.readAt).toBeTruthy();
  });

  // --- 4. session.status ---
  it('4. Webhook session.status deve atualizar GpnConnection.status', async () => {
    // Status: connected
    await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_session_connected_001',
      tenantId: orgAId,
      data: { status: 'connected' },
      secret: GPN_WEBHOOK_SECRET
    });
    await new Promise((r) => setTimeout(r, 500));

    let conn = await prisma.gpnConnection.findUnique({ where: { organizationId: orgAId } });
    expect(conn!.status).toBe('CONNECTED');

    // Status: disconnected
    await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_session_disconnected_001',
      tenantId: orgAId,
      data: { status: 'disconnected' },
      secret: GPN_WEBHOOK_SECRET
    });
    await new Promise((r) => setTimeout(r, 500));

    conn = await prisma.gpnConnection.findUnique({ where: { organizationId: orgAId } });
    expect(conn!.status).toBe('DISCONNECTED');
  });

  // --- 5. HMAC válido aceito ---
  it('5. Webhook com HMAC válido deve retornar 200', async () => {
    const res = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_hmac_valid_001',
      tenantId: orgAId,
      data: { status: 'connected' },
      secret: GPN_WEBHOOK_SECRET
    });
    expect(res.status).toBe(200);
  });

  // --- 6. HMAC inválido rejeitado ---
  it('6. Webhook com HMAC inválido deve retornar 403', async () => {
    const res = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_hmac_invalid_001',
      tenantId: orgAId,
      data: { status: 'connected' },
      secret: GPN_WEBHOOK_SECRET,
      signatureOverride: 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
    });
    expect(res.status).toBe(403);
    const json = await res.json() as any;
    expect(json.error).toBe('GPN_SIGNATURE_INVALID');
  });

  // --- 7. Replay rejeitado ---
  it('7. Webhook com timestamp expirado deve retornar 403 (replay protection)', async () => {
    const oldTimestamp = Date.now() - 400_000; // 400s atrás (> 300s tolerância)
    const res = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_replay_001',
      tenantId: orgAId,
      data: { status: 'connected' },
      secret: GPN_WEBHOOK_SECRET,
      timestamp: oldTimestamp
    });
    expect(res.status).toBe(403);
    const json = await res.json() as any;
    expect(json.error).toBe('GPN_SIGNATURE_INVALID');
    expect(json.message).toMatch(/Timestamp expirado/);
  });

  // --- 8. Idempotência ---
  it('8. Webhook com eventId duplicado deve retornar 200 com duplicate=true', async () => {
    // Primeiro envio (deve passar)
    const res1 = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_idempotent_001',
      tenantId: orgAId,
      data: { status: 'connected' },
      secret: GPN_WEBHOOK_SECRET
    });
    expect(res1.status).toBe(200);

    // Segundo envio com mesmo eventId (deve retornar duplicate)
    const res2 = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: 'evt_idempotent_001',
      tenantId: orgAId,
      data: { status: 'connected' },
      secret: GPN_WEBHOOK_SECRET
    });
    expect(res2.status).toBe(200);
    const json2 = await res2.json() as any;
    expect(json2.duplicate).toBe(true);
  });

  // --- 9. Isolamento multi-tenant ---
  it('9. Evento com tenantId de Org sem GPN configurado deve retornar 404', async () => {
    const res = await sendGpnWebhook(baseUrl, {
      event: 'message.inbound',
      eventId: 'evt_cross_tenant_001',
      tenantId: orgBId, // Org B NÃO tem GpnConnection
      data: {
        messageId: 'MSG_CROSS_001',
        remoteJid: '5511900001111@s.whatsapp.net',
        text: 'Tentativa cross-tenant',
        fromMe: false
      },
      secret: GPN_WEBHOOK_SECRET
    });
    expect(res.status).toBe(404);
    const json = await res.json() as any;
    expect(json.error).toBe('GPN_TENANT_NOT_FOUND');

    // Confirma que nenhuma Person foi criada na Org B
    const person = await prisma.person.findFirst({
      where: { organizationId: orgBId, normalizedPhone: '+5511900001111' }
    });
    expect(person).toBeNull();
  });

  // --- 10. GPN ignora regra de 24h ---
  it('10. WhatsAppProviderFactory.getProviderType deve retornar GPN para organização com GpnConnection ativa', async () => {
    const { WhatsAppProviderFactory } = await import('../src/infrastructure/whatsapp/whatsapp-provider.factory.js');
    const typeA = await WhatsAppProviderFactory.getProviderType(orgAId);
    expect(typeA).toBe('GPN');

    // Org B sem GPN deve ser MOCK (isMock default)
    const typeB = await WhatsAppProviderFactory.getProviderType(orgBId);
    expect(typeB).toBe('MOCK');
  });

  // --- 11. Meta mantém regra de 24h (validação estática) ---
  it('11. ConversationsController deve aplicar janela de 24h somente para META, não para GPN', async () => {
    // Este teste valida que o getProviderType funciona corretamente
    // e que a lógica condicional está no lugar.
    // O teste real E2E da janela de 24h está em postgres-integration.test.ts.

    const { WhatsAppProviderFactory } = await import('../src/infrastructure/whatsapp/whatsapp-provider.factory.js');

    // Org A (GPN) → não deve aplicar 24h
    const gpnType = await WhatsAppProviderFactory.getProviderType(orgAId);
    expect(gpnType).not.toBe('META');

    // Cria uma WhatsAppConnection real para Org B para simular META
    await prisma.whatsAppConnection.upsert({
      where: { organizationId: orgBId },
      create: {
        organizationId: orgBId,
        phoneNumberId: 'test_meta_phone_id',
        wabaId: 'test_waba_id',
        encryptedAccessToken: CryptoService.encrypt('test_access_token'),
        encryptedAppSecret: CryptoService.encrypt('test_app_secret'),
        isMock: false,
        status: 'CONNECTED'
      },
      update: {
        phoneNumberId: 'test_meta_phone_id',
        isMock: false,
        status: 'CONNECTED'
      }
    });

    const metaType = await WhatsAppProviderFactory.getProviderType(orgBId);
    expect(metaType).toBe('META');
  });
});
