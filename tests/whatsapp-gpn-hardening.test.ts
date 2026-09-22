import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';

process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

import { buildApp, validateProductionEnvironment } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { WhatsAppLifecycleService } from '../src/application/services/whatsapp-lifecycle.service.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';
import { GPNWhatsAppProvider } from '../src/infrastructure/whatsapp/gpn-whatsapp.provider.js';
import { MetaWhatsAppProvider } from '../src/infrastructure/whatsapp/meta-whatsapp.provider.js';
import { MockWhatsAppProvider } from '../src/infrastructure/whatsapp/mock-whatsapp.provider.js';
import { runRealGpnContractTest } from '../scripts/test-real-gpn-contract.js';

/**
 * Hardening, Resiliência e Segurança do WhatsApp GPN (Agente 3 / QA)
 *
 * Cenários:
 *  1. GPN offline em ambiente de produção NÃO retorna QR fake (lança [GPN_UNAVAILABLE]);
 *  2. Ausência de credenciais GPN (GPN_API_KEY, GPN_API_URL) em produção falha no startup via validateProductionEnvironment();
 *  3. sessionId NÃO aparece em nenhuma resposta da API pública (/status, /connect, /replace, /reconnect, /disconnect);
 *  4. Troca de número em duas fases (Two-Phase Replacement):
 *     - Criação de pendingSession com novo QR;
 *     - Sessão anterior continua CONNECTED e ativa enquanto nova aguarda QR;
 *     - Webhook connected para a nova sessão promove-a a ativa e encerra a anterior;
 *  5. Cancelamento ou falha da troca em duas fases mantém a sessão anterior 100% intacta;
 *  6. Meta como contingência na vertical ACCOUNTING só ativa se houver decisão administrativa explícita
 *     (preferredProvider='META' + flag de autorização deliberada);
 *  7. Vertical ACCOUNTING em NODE_ENV=production NUNCA retorna MockWhatsAppProvider;
 *  8. Incidente GPN é registrado mesmo se o tenant não tiver Person/cliente cadastrado;
 *  9. Ao reconectar o GPN (session.status: connected), o incidente operacional é automaticamente marcado como resolvido;
 * 10. Runner de teste de contrato do GPN real (scripts/test-real-gpn-contract.ts) valida contrato JSON e registra evidência.
 */

const TEST_GPN_API_KEY = 'gpn_hardening_test_api_key_32bytes!';
const TEST_GPN_WEBHOOK_SECRET = 'gpn_hardening_webhook_secret_32bytes!';

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

describe('WhatsApp GPN Hardening & Resilience Suite (Agente 3 - QA)', () => {
  let appServer: http.Server;
  let gpnMockServer: http.Server;
  let baseUrl: string;
  let gpnMockUrl: string;
  let churchOrgId: string;
  let churchUserId: string;
  let userCookie: string;
  const deletedSessions: string[] = [];
  const createdSessions: string[] = [];
  let simulateGpnOffline = false;

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
    // 1. Mock Server configurável do GPN Core Gateway
    gpnMockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const url = req.url || '';
        const method = req.method;
        res.setHeader('content-type', 'application/json');

        if (simulateGpnOffline) {
          res.writeHead(503);
          res.end(JSON.stringify({ ok: false, error: 'GPN_GATEWAY_OFFLINE' }));
          return;
        }

        if (url === '/api/v1/sessions' && method === 'POST') {
          const parsed = JSON.parse(body || '{}');
          if (parsed.sessionId) createdSessions.push(parsed.sessionId);
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            status: 'WAITING_QR',
            qr: `2@gpn_real_contract_qr_${parsed.sessionId || 'default'}_${Date.now()}`
          }));
          return;
        }

        if (url.includes('/reconnect') && method === 'POST') {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, status: 'connecting' }));
          return;
        }

        if (url.startsWith('/api/v1/sessions/') && method === 'DELETE') {
          const sessId = url.split('/').pop() || '';
          deletedSessions.push(sessId);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, status: 'disconnected' }));
          return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not_found' }));
      });
    });

    await new Promise<void>(resolve => gpnMockServer.listen(0, '127.0.0.1', () => resolve()));
    const gpnAddr = gpnMockServer.address() as any;
    gpnMockUrl = `http://127.0.0.1:${gpnAddr.port}`;

    // 2. Inicia servidor Express
    const { app } = buildApp();
    appServer = await new Promise<http.Server>(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = appServer.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // 3. Cadastra usuário administrador
    const userEmail = `qa-hardening-admin-${Date.now()}@yeshuacontabilidade.com.br`;
    const signupRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Administrador QA Hardening',
        email: userEmail,
        password: 'AdminPassword123!'
      })
    });
    userCookie = parseCookieHeader(signupRes);
    const dbUser = await prisma.user.findUnique({ where: { email: userEmail } });
    churchUserId = dbUser!.id;

    // 4. Cria organização inicial Yeshua Accounting com GPN
    const org = await prisma.organization.create({
      data: {
        name: 'Yeshua Auditoria e Contabilidade Eclesiástica',
        slug: `yeshua-hardening-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN',
          brandName: 'YESHUA DESK IGREJAS'
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
            sessionId: `sess-hardening-${Date.now()}`,
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
    if (appServer) await new Promise<void>(resolve => appServer.close(() => resolve()));
    if (gpnMockServer) await new Promise<void>(resolve => gpnMockServer.close(() => resolve()));

    try {
      if (churchOrgId) {
        await prisma.gpnWebhookEvent.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.auditLog.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.followUpTask.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.message.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.person.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.gpnConnection.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.organization.delete({ where: { id: churchOrgId } }).catch(() => {});
      }
      if (churchUserId) {
        await prisma.user.delete({ where: { id: churchUserId } }).catch(() => {});
      }
    } catch {}
  });

  // =========================================================================
  // 1. GPN OFFLINE EM PRODUÇÃO NÃO RETORNA QR FAKE
  // =========================================================================
  it('1. GPN offline em ambiente de produção NÃO retorna QR fake (deve lançar erro / [GPN_UNAVAILABLE])', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // 1. Instancia provedor apontando para URL inalcançável
    const deadProvider = new GPNWhatsAppProvider({
      apiUrl: 'https://dead-gpn-gateway-offline.internal',
      apiKey: TEST_GPN_API_KEY,
      sessionId: `dead-session-${Date.now()}`
    });

    let thrownError: any = null;
    try {
      await deadProvider.startSession(`dead-session-${Date.now()}`);
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).toBeTruthy();
    expect(thrownError.message).toContain('[GPN_UNAVAILABLE]');
    expect(thrownError.message).not.toContain('gpn_simulated_qr_code');

    // 2. Testa também via WhatsAppLifecycleService.connect para organização com GPN offline
    const offlineOrg = await prisma.organization.create({
      data: {
        name: 'Offline Church Test',
        slug: `offline-church-${Date.now()}`,
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING', preferredProvider: 'GPN' }),
        gpnConnection: {
          create: {
            apiUrl: 'https://dead-gpn-gateway-offline.internal',
            sessionId: `sess-offline-${Date.now()}`,
            encryptedApiKey: CryptoService.encrypt(TEST_GPN_API_KEY),
            encryptedWebhookSecret: CryptoService.encrypt(TEST_GPN_WEBHOOK_SECRET),
            isActive: true,
            status: 'DISCONNECTED'
          }
        }
      }
    });

    let lifecycleError: any = null;
    try {
      await WhatsAppLifecycleService.connect(offlineOrg.id);
    } catch (err: any) {
      lifecycleError = err;
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      await prisma.gpnConnection.deleteMany({ where: { organizationId: offlineOrg.id } });
      await prisma.organization.delete({ where: { id: offlineOrg.id } }).catch(() => {});
    }

    expect(lifecycleError).toBeTruthy();
    expect(lifecycleError.message).toContain('[GPN_UNAVAILABLE]');
  });

  // =========================================================================
  // 2. FAIL-FAST: AUSÊNCIA DE GPN_API_KEY / GPN_API_URL EM PRODUÇÃO
  // =========================================================================
  it('2. Ausência de credenciais GPN (GPN_API_KEY, GPN_API_URL) em produção falha no startup via validateProductionEnvironment()', () => {
    const origEnv = { ...process.env };

    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@host.neon.tech/db?sslmode=require';
    process.env.BETTER_AUTH_SECRET = 'a_very_secure_secret_with_more_than_32_characters_123';
    process.env.BETTER_AUTH_URL = 'https://yeshua-demo.onrender.com';
    process.env.ENCRYPTION_MASTER_KEY = origEnv.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';
    process.env.VERTICAL_PROFILE = 'ACCOUNTING';
    process.env.YESHUA_DEMO_EMAIL = 'demo@yeshuacontabilidade.com.br';
    process.env.YESHUA_DEMO_PASSWORD = 'demo';
    process.env.GPN_WEBHOOK_SECRET = 'a_very_secure_webhook_secret_32bytes!';

    // 2a. Falha com ausência de GPN_API_KEY
    delete process.env.GPN_API_KEY;
    process.env.GPN_API_URL = 'https://gpn.infra.internal';
    expect(() => validateProductionEnvironment()).toThrow(/GPN_API_KEY/);

    // 2b. Falha com ausência de GPN_API_URL
    process.env.GPN_API_KEY = 'gpn_secret_key_production_32bytes!';
    delete process.env.GPN_API_URL;
    expect(() => validateProductionEnvironment()).toThrow(/GPN_API_URL/);

    // 2c. Falha com ausência de ambas
    delete process.env.GPN_API_KEY;
    delete process.env.GPN_API_URL;
    expect(() => validateProductionEnvironment()).toThrow(/GPN_API_KEY/);
    expect(() => validateProductionEnvironment()).toThrow(/GPN_API_URL/);

    // 2d. Com credenciais configuradas corretamente, passa no startup
    process.env.GPN_API_KEY = 'gpn_secret_key_production_32bytes!';
    process.env.GPN_API_URL = 'https://gpn.infra.internal';
    expect(() => validateProductionEnvironment()).not.toThrow();

    // Restaura o ambiente completamente
    process.env = { ...origEnv };
  });

  // =========================================================================
  // 3. SEGURANÇA: sessionId NUNCA APARECE NA API PÚBLICA
  // =========================================================================
  it('3. sessionId NÃO aparece em nenhuma resposta da API pública (/status, /connect, /replace, /reconnect, /disconnect)', async () => {
    // Garante que o gpnConnection está ativo
    await prisma.gpnConnection.update({
      where: { organizationId: churchOrgId },
      data: { isActive: true, status: 'DISCONNECTED' }
    });

    // 3a. POST /connect
    const connectRes = await fetch(`${baseUrl}/api/organization/whatsapp/connect`, {
      method: 'POST',
      headers: { cookie: userCookie, 'x-organization-id': churchOrgId }
    });
    expect(connectRes.status).toBe(200);
    const connectJson = await connectRes.json() as any;
    expect(connectJson.sessionId).toBeUndefined();
    expect(connectJson.qrCode).toBeDefined();

    // 3b. GET /status
    const statusRes = await fetch(`${baseUrl}/api/organization/whatsapp/status`, {
      method: 'GET',
      headers: { cookie: userCookie, 'x-organization-id': churchOrgId }
    });
    expect(statusRes.status).toBe(200);
    const statusJson = await statusRes.json() as any;
    expect(statusJson.sessionId).toBeUndefined();

    // 3c. POST /reconnect
    const reconnectRes = await fetch(`${baseUrl}/api/organization/whatsapp/reconnect`, {
      method: 'POST',
      headers: { cookie: userCookie, 'x-organization-id': churchOrgId }
    });
    expect(reconnectRes.status).toBe(200);
    const reconnectJson = await reconnectRes.json() as any;
    expect(reconnectJson.sessionId).toBeUndefined();

    // 3d. POST /replace
    const replaceRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie, 'x-organization-id': churchOrgId },
      body: JSON.stringify({ confirm: true, reason: 'Auditoria de segurança sessionId' })
    });
    expect(replaceRes.status).toBe(200);
    const replaceJson = await replaceRes.json() as any;
    expect(replaceJson.sessionId).toBeUndefined();
    if (replaceJson.pendingReplacement) {
      expect(replaceJson.pendingReplacement.newSessionId).toBeUndefined();
      expect(replaceJson.pendingReplacement.previousSessionId).toBeUndefined();
    }

    // 3e. DELETE /disconnect
    const disconnectRes = await fetch(`${baseUrl}/api/organization/whatsapp/disconnect`, {
      method: 'DELETE',
      headers: { cookie: userCookie, 'x-organization-id': churchOrgId }
    });
    expect(disconnectRes.status).toBe(200);
    const disconnectJson = await disconnectRes.json() as any;
    expect(disconnectJson.sessionId).toBeUndefined();

    // Limpa qualquer staging pendente gerado no teste 3
    await fetch(`${baseUrl}/api/organization/whatsapp/replace/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie, 'x-organization-id': churchOrgId },
      body: JSON.stringify({ reason: 'Limpeza de teste 3' })
    });
  });

  // =========================================================================
  // 4. TROCA DE NÚMERO EM DUAS FASES (TWO-PHASE REPLACEMENT)
  // =========================================================================
  it('4. Troca de número em duas fases: pendingSession criada, sessão anterior mantida CONNECTED até promoção via webhook', async () => {
    // 4a. Conecta e ativa sessão inicial (garantindo que não há staging residual)
    const orgClean = await prisma.organization.findUnique({ where: { id: churchOrgId } });
    if (orgClean?.metadata) {
      const meta = JSON.parse(orgClean.metadata);
      delete meta.pendingWhatsAppReplacement;
      await prisma.organization.update({ where: { id: churchOrgId }, data: { metadata: JSON.stringify(meta) } });
    }

    const initialSessionId = `sess-initial-active-${Date.now()}`;
    await prisma.gpnConnection.update({
      where: { organizationId: churchOrgId },
      data: { sessionId: initialSessionId, status: 'CONNECTED', isActive: true }
    });

    const activePhone = '+5511999991111';
    const initWebhookRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: `evt_init_${Date.now()}`,
      tenantId: churchOrgId,
      sessionId: initialSessionId,
      data: { status: 'connected', phone: activePhone },
      secret: TEST_GPN_WEBHOOK_SECRET
    });
    expect(initWebhookRes.status).toBe(200);

    // Aguarda sincronização do webhook inicial
    let statusBefore: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      statusBefore = await WhatsAppLifecycleService.getStatus(churchOrgId);
      if (statusBefore.status === 'CONECTADO' && statusBefore.connectedPhone === activePhone) break;
    }
    expect(statusBefore.status).toBe('CONECTADO');
    expect(statusBefore.connectedPhone).toBe(activePhone);
    expect(statusBefore.isOperating).toBe(true);

    // 4b. Solicita substituição de número em duas fases
    const replaceRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie, 'x-organization-id': churchOrgId },
      body: JSON.stringify({ confirm: true, reason: 'Troca pelo chip da Tesouraria 2026' })
    });
    expect(replaceRes.status).toBe(200);
    const replaceJson = await replaceRes.json() as any;
    expect(replaceJson.status).toBe('AGUARDANDO_QR');
    expect(replaceJson.qrCode).toBeTruthy();

    // 4c. VALIDAÇÃO CRÍTICA: Sessão anterior continua 100% CONNECTED no banco enquanto a nova aguarda QR
    const dbConnDuringSwap = await prisma.gpnConnection.findUnique({ where: { organizationId: churchOrgId } });
    expect(dbConnDuringSwap!.sessionId).toBe(initialSessionId);
    expect(dbConnDuringSwap!.status).toBe('CONNECTED');

    // Valida que pendingReplacement foi gravado em metadata
    const orgDuringSwap = await prisma.organization.findUnique({ where: { id: churchOrgId } });
    const metaDuringSwap = JSON.parse(orgDuringSwap!.metadata || '{}');
    expect(metaDuringSwap.pendingWhatsAppReplacement).toBeDefined();
    const pendingSessionId = metaDuringSwap.pendingWhatsAppReplacement.newSessionId;
    expect(pendingSessionId).toBeTruthy();
    expect(pendingSessionId).not.toBe(initialSessionId);

    // 4d. Webhook 'connected' chega para a nova sessão
    const newPhone = '+5511988882222';
    deletedSessions.length = 0; // zera contagem de sessões encerradas no mock

    const webhookRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: `evt_promote_${Date.now()}`,
      tenantId: churchOrgId,
      sessionId: pendingSessionId,
      data: { status: 'connected', phone: newPhone },
      secret: TEST_GPN_WEBHOOK_SECRET
    });
    expect(webhookRes.status).toBe(200);

    // 4e. Aguarda promoção assíncrona da nova sessão e limpeza completa do staging
    let dbConnAfterSwap: any = null;
    let metaAfterSwap: any = {};
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      dbConnAfterSwap = await prisma.gpnConnection.findUnique({ where: { organizationId: churchOrgId } });
      const org = await prisma.organization.findUnique({ where: { id: churchOrgId } });
      metaAfterSwap = JSON.parse(org?.metadata || '{}');
      if (dbConnAfterSwap?.sessionId === pendingSessionId && !metaAfterSwap.pendingWhatsAppReplacement) {
        break;
      }
    }

    expect(dbConnAfterSwap!.sessionId).toBe(pendingSessionId);
    expect(dbConnAfterSwap!.status).toBe('CONNECTED');

    // Sessão anterior foi solicitada para encerramento no GPN Gateway
    expect(deletedSessions).toContain(initialSessionId);

    // Staging limpo de Organization.metadata
    expect(metaAfterSwap.pendingWhatsAppReplacement).toBeUndefined();

    // Status do canal atualizado com novo telefone
    const finalStatus = await WhatsAppLifecycleService.getStatus(churchOrgId);
    expect(finalStatus.status).toBe('CONECTADO');
    expect(finalStatus.connectedPhone).toBe(newPhone);
  });

  // =========================================================================
  // 5. CANCELAMENTO OU FALHA DA TROCA MANTÉM SESSÃO ANTERIOR 100% INTACTA
  // =========================================================================
  it('5. Cancelamento ou falha da troca em duas fases mantém a sessão anterior 100% intacta', async () => {
    // 5a. Garante sessão ativa e limpa staging residual
    const orgClean5 = await prisma.organization.findUnique({ where: { id: churchOrgId } });
    if (orgClean5?.metadata) {
      const meta = JSON.parse(orgClean5.metadata);
      delete meta.pendingWhatsAppReplacement;
      await prisma.organization.update({ where: { id: churchOrgId }, data: { metadata: JSON.stringify(meta) } });
    }

    const currentSessionId = `sess-stable-${Date.now()}`;
    await prisma.gpnConnection.update({
      where: { organizationId: churchOrgId },
      data: { sessionId: currentSessionId, status: 'CONNECTED', isActive: true }
    });

    // Inicia solicitação de substituição (gera staging)
    await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie, 'x-organization-id': churchOrgId },
      body: JSON.stringify({ confirm: true, reason: 'Teste de cancelamento' })
    });

    // Cancela a troca via endpoint de cancelamento
    const cancelRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie, 'x-organization-id': churchOrgId },
      body: JSON.stringify({ reason: 'Operação cancelada pelo usuário' })
    });
    expect(cancelRes.status).toBe(200);

    // Sessão anterior continua 100% intacta
    const dbConnAfterCancel = await prisma.gpnConnection.findUnique({ where: { organizationId: churchOrgId } });
    expect(dbConnAfterCancel!.sessionId).toBe(currentSessionId);
    expect(dbConnAfterCancel!.status).toBe('CONNECTED');

    // 5b. Simula falha (webhook de erro na sessão pendente)
    await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie, 'x-organization-id': churchOrgId },
      body: JSON.stringify({ confirm: true, reason: 'Teste de falha no QR' })
    });

    const orgWithPending = await prisma.organization.findUnique({ where: { id: churchOrgId } });
    const pendingSessionId = JSON.parse(orgWithPending!.metadata || '{}').pendingWhatsAppReplacement?.newSessionId;
    expect(pendingSessionId).toBeTruthy();

    // Webhook session.status: error chega para a sessão pendente
    const failWebhookRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: `evt_fail_${Date.now()}`,
      tenantId: churchOrgId,
      sessionId: pendingSessionId,
      data: { status: 'error' },
      secret: TEST_GPN_WEBHOOK_SECRET
    });
    expect(failWebhookRes.status).toBe(200);

    // Aguarda cancelamento assíncrono por falha
    let orgAfterFail: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      orgAfterFail = await prisma.organization.findUnique({ where: { id: churchOrgId } });
      const meta = JSON.parse(orgAfterFail?.metadata || '{}');
      if (!meta.pendingWhatsAppReplacement) break;
    }

    // Sessão anterior continua 100% intacta e conectada
    const dbConnAfterError = await prisma.gpnConnection.findUnique({ where: { organizationId: churchOrgId } });
    expect(dbConnAfterError!.sessionId).toBe(currentSessionId);
    expect(dbConnAfterError!.status).toBe('CONNECTED');

    expect(JSON.parse(orgAfterFail!.metadata || '{}').pendingWhatsAppReplacement).toBeUndefined();
  });

  // =========================================================================
  // 6. META NA VERTICAL ACCOUNTING EXIGE AUTORIZAÇÃO DELIBERADA
  // =========================================================================
  it('6. Meta como contingência na vertical ACCOUNTING só ativa se houver decisão administrativa explícita (preferredProvider=META + flag de autorização deliberada)', async () => {
    // 6a. Cria conexão com a Meta para a organização
    await prisma.whatsAppConnection.deleteMany({ where: { organizationId: churchOrgId } });
    await prisma.whatsAppConnection.create({
      data: {
        organizationId: churchOrgId,
        phoneNumberId: 'meta_phone_123456',
        encryptedAccessToken: CryptoService.encrypt('EAAG_test_token_accounting'),
        encryptedAppSecret: CryptoService.encrypt('meta_app_secret_123456'),
        webhookVerifyToken: 'meta_verify_token_accounting',
        isMock: false,
        status: 'CONNECTED'
      }
    });

    // Define preferredProvider='META', mas SEM a flag de autorização deliberada
    await prisma.organization.update({
      where: { id: churchOrgId },
      data: {
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'META',
          metaContingencyApproved: false
        })
      }
    });

    // Sem a flag deliberada, o sistema rejeita a ativação da Meta
    await expect(WhatsAppProviderFactory.getProviderForOrganization(churchOrgId))
      .rejects.toThrow(/\[WHATSAPP_PROD_ERROR\] Provedor Meta não autorizado para o perfil ACCOUNTING sem aprovação administrativa deliberada/);

    // 6b. Com a flag deliberada metaContingencyApproved: true
    await prisma.organization.update({
      where: { id: churchOrgId },
      data: {
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'META',
          metaContingencyApproved: true
        })
      }
    });

    const providerWithFlag = await WhatsAppProviderFactory.getProviderForOrganization(churchOrgId);
    expect(providerWithFlag).toBeInstanceOf(MetaWhatsAppProvider);
  });

  // =========================================================================
  // 7. VERTICAL ACCOUNTING EM PRODUÇÃO NUNCA RETORNA MOCK
  // =========================================================================
  it('7. Vertical ACCOUNTING em NODE_ENV=production NUNCA retorna MockWhatsAppProvider', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Cria uma organização temporária sem provedores reais configurados
    const noRealProviderOrg = await prisma.organization.create({
      data: {
        name: 'Yeshua Sem Provedores',
        slug: `yeshua-no-prov-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'MOCK'
        })
      }
    });

    let thrownError: any = null;
    let provider: any = null;
    try {
      provider = await WhatsAppProviderFactory.getProviderForOrganization(noRealProviderOrg.id);
    } catch (err: any) {
      thrownError = err;
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      await prisma.organization.delete({ where: { id: noRealProviderOrg.id } }).catch(() => {});
    }

    expect(provider).toBeNull();
    expect(thrownError).toBeTruthy();
    expect(thrownError.message).toMatch(/\[(WHATSAPP_PROD_ERROR|SECURITY_VIOLATION)\]/);
    expect(thrownError.message).toContain('Mock');
  });

  // =========================================================================
  // 8. INCIDENTE GPN É REGISTRADO MESMO SEM PERSON/CLIENTE CADASTRADO
  // =========================================================================
  it('8. Incidente GPN é registrado mesmo se tenant não tiver Person/cliente cadastrado', async () => {
    // 8a. Cria tenant isolado sem nenhuma Person cadastrada
    const emptyOrg = await prisma.organization.create({
      data: {
        name: 'Igreja Nova Sem Pessoas Cadastradas',
        slug: `empty-church-${Date.now()}`,
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING', preferredProvider: 'GPN' }),
        gpnConnection: {
          create: {
            apiUrl: gpnMockUrl,
            sessionId: `sess-empty-${Date.now()}`,
            encryptedApiKey: CryptoService.encrypt(TEST_GPN_API_KEY),
            encryptedWebhookSecret: CryptoService.encrypt(TEST_GPN_WEBHOOK_SECRET),
            isActive: true,
            status: 'ERROR'
          }
        }
      }
    });

    const personsCount = await prisma.person.count({ where: { organizationId: emptyOrg.id } });
    expect(personsCount).toBe(0);

    // Dispara alerta operacional de indisponibilidade
    await WhatsAppProviderFactory.reportGpnUnavailableAlert(emptyOrg.id, 'ERROR');

    // Valida que o incidente foi gravado em AuditLog mesmo sem Person
    const incidentAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: emptyOrg.id,
        action: 'GPN_OPERATIONAL_INCIDENT'
      }
    });
    expect(incidentAudit).toBeTruthy();
    expect(incidentAudit!.entityType).toBe('GpnConnection');
    expect(incidentAudit!.details).toContain('interrompido sem fallback automático para a Meta');

    // Valida que o incidente foi gravado em Organization.metadata.gpnIncident
    const updatedEmptyOrg = await prisma.organization.findUnique({ where: { id: emptyOrg.id } });
    const meta = JSON.parse(updatedEmptyOrg!.metadata || '{}');
    expect(meta.gpnIncident?.active).toBe(true);
    expect(meta.gpnIncident?.status).toBe('ERROR');

    // Limpa tenant temporário
    await prisma.auditLog.deleteMany({ where: { organizationId: emptyOrg.id } });
    await prisma.gpnConnection.deleteMany({ where: { organizationId: emptyOrg.id } });
    await prisma.organization.delete({ where: { id: emptyOrg.id } });
  });

  // =========================================================================
  // 9. RECONEXÃO GPN RESOLVE AUTOMATICAMENTE O INCIDENTE OPERACIONAL
  // =========================================================================
  it('9. Ao reconectar o GPN (session.status: connected), o incidente operacional é automaticamente marcado como resolvido', async () => {
    // 9a. Garante que churchOrgId tem gpnConnection ativa
    await prisma.gpnConnection.update({
      where: { organizationId: churchOrgId },
      data: { isActive: true, status: 'DISCONNECTED' }
    });

    // Simula incidente ativo no tenant Yeshua
    await prisma.organization.update({
      where: { id: churchOrgId },
      data: {
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN',
          gpnIncident: {
            active: true,
            status: 'ERROR',
            startedAt: new Date().toISOString()
          }
        })
      }
    });

    // Garante uma pessoa e tarefa de follow-up de indisponibilidade pendente
    let person = await prisma.person.findFirst({ where: { organizationId: churchOrgId } });
    if (!person) {
      person = await prisma.person.create({
        data: {
          organizationId: churchOrgId,
          name: 'Pastor Teste Incidentes',
          phone: '11988880000',
          normalizedPhone: '+5511988880000'
        }
      });
    }

    const task = await prisma.followUpTask.create({
      data: {
        organizationId: churchOrgId,
        personId: person.id,
        title: 'Alerta Operacional: GPN Indisponível (ERROR)',
        description: 'Aguardando recuperação do canal GPN',
        priority: 'URGENT',
        status: 'PENDING'
      }
    });
    const followUpTaskId = task.id;

    // 9b. Recebe webhook session.status: connected indicando restabelecimento do canal
    const recoverSessionId = `sess-recover-${Date.now()}`;
    await prisma.gpnConnection.update({
      where: { organizationId: churchOrgId },
      data: { sessionId: recoverSessionId, status: 'DISCONNECTED', isActive: true }
    });

    const webhookRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: `evt_recover_${Date.now()}`,
      tenantId: churchOrgId,
      sessionId: recoverSessionId,
      data: { status: 'connected', phone: '+5511977773333' },
      secret: TEST_GPN_WEBHOOK_SECRET
    });
    expect(webhookRes.status).toBe(200);

    // 9c. Aguarda processamento assíncrono do webhook de reconexão e resolução do incidente
    let recoveredOrg: any = null;
    let recoveredMeta: any = {};
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      recoveredOrg = await prisma.organization.findUnique({ where: { id: churchOrgId } });
      recoveredMeta = JSON.parse(recoveredOrg?.metadata || '{}');
      if (recoveredMeta.gpnIncident?.active === false) break;
    }

    expect(recoveredMeta.gpnIncident?.active).toBe(false);
    expect(recoveredMeta.gpnIncident?.resolvedAt).toBeTruthy();

    // Validação: AuditLog de resolução gravado
    const resolutionAudit = await prisma.auditLog.findFirst({
      where: {
        organizationId: churchOrgId,
        action: 'GPN_INCIDENT_RESOLVED'
      }
    });
    expect(resolutionAudit).toBeTruthy();

    // Validação: FollowUpTask pendente foi marcada como COMPLETED
    const updatedTask = await prisma.followUpTask.findUnique({ where: { id: followUpTaskId } });
    expect(updatedTask!.status).toBe('COMPLETED');
    expect(updatedTask!.completedAt).toBeTruthy();
  });

  // =========================================================================
  // 10. TESTE DE CONTRATO DO GPN REAL VIA RUNNER scripts/test-real-gpn-contract.ts
  // =========================================================================
  it('10. Runner scripts/test-real-gpn-contract.ts valida contrato JSON e registra evidência formal de QR real', async () => {
    const contractResult = await runRealGpnContractTest({
      apiUrl: gpnMockUrl,
      apiKey: TEST_GPN_API_KEY,
      sessionId: `contract-spec-${Date.now()}`,
      verbose: false
    });

    expect(contractResult.success).toBe(true);
    expect(contractResult.evidence).toBeDefined();

    const { contractValidation, rawResponseSummary, targetUrl } = contractResult.evidence;
    expect(targetUrl).toBe(gpnMockUrl);
    expect(contractValidation.allPassed).toBe(true);
    expect(contractValidation.hasOkField).toBe(true);
    expect(contractValidation.okIsTrue).toBe(true);
    expect(contractValidation.hasStatusField).toBe(true);
    expect(contractValidation.hasValidQr).toBe(true);
    expect(contractValidation.qrLength).toBeGreaterThan(10);
    expect(contractValidation.qrPreview).toContain('2@gpn_real_contract_');
    expect(rawResponseSummary.ok).toBe(true);
    expect(rawResponseSummary.hasQr).toBe(true);
  });
});
