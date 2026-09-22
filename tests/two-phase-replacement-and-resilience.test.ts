import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { buildApp } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { WhatsAppLifecycleService } from '../src/application/services/whatsapp-lifecycle.service.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';

/**
 * Suíte de Testes: Two-Phase Replacement & Resiliência GPN
 *
 * Valida os requisitos 4 e 7:
 * 4. SUBSTITUIÇÃO DE NÚMERO EM DUAS FASES (TWO-PHASE REPLACEMENT)
 *    - CURRENT_SESSION permanece ATIVA e operacional ao solicitar troca.
 *    - PENDING_SESSION criada em Organization.metadata.pendingWhatsAppReplacement.
 *    - POST /api/organization/whatsapp/replace/cancel cancela e limpa staging mantendo a anterior.
 *    - Webhook session.status: connected promove nova sessão para ativa, encerra a anterior,
 *      registra WHATSAPP_NUMBER_REPLACED_COMPLETED e limpa staging.
 *
 * 7. INCIDENTE GPN INDEPENDENTE DE PERSON
 *    - reportGpnUnavailableAlert() NÃO depende de existir Person.
 *    - Sem Person: registra AuditLog (GPN_OPERATIONAL_INCIDENT) e metadata.gpnIncident = { active: true }.
 *    - Com Person: além de AuditLog e metadata, cria FollowUpTask URGENT.
 *    - Ao receber session.status: connected (recuperação): FollowUpTasks resolvidas para COMPLETED,
 *      metadata.gpnIncident = { active: false, resolvedAt } e AuditLog (GPN_INCIDENT_RESOLVED).
 */

const TEST_GPN_API_KEY = 'gpn_two_phase_test_key_32bytes!';
const TEST_GPN_WEBHOOK_SECRET = 'gpn_two_phase_secret_32bytes!';

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

describe('Two-Phase Replacement & Resiliência de Protocolo GPN', () => {
  let appServer: http.Server;
  let gpnMockServer: http.Server;
  let baseUrl: string;
  let gpnMockUrl: string;
  let orgId: string;
  let userId: string;
  let userCookie: string;
  const deletedSessions: string[] = [];
  const startedSessions: string[] = [];

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
    // 1. Mock Server do GPN
    gpnMockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const url = req.url || '';
        const method = req.method;
        res.setHeader('content-type', 'application/json');

        if (url === '/api/v1/sessions' && method === 'POST') {
          const parsed = JSON.parse(body || '{}');
          if (parsed.sessionId) startedSessions.push(parsed.sessionId);
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            status: 'WAITING_QR',
            qr: `2@mock_qr_for_${parsed.sessionId || 'session'}`
          }));
          return;
        }

        if (url.startsWith('/api/v1/sessions/') && method === 'DELETE') {
          const parts = url.split('/');
          const sess = parts[parts.length - 1];
          deletedSessions.push(sess);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, status: 'disconnected' }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => {
      gpnMockServer.listen(0, '127.0.0.1', () => resolve());
    });
    const gpnAddr = gpnMockServer.address() as any;
    gpnMockUrl = `http://127.0.0.1:${gpnAddr.port}`;

    // 2. Conecta CRM Server
    const { app } = buildApp();
    appServer = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = appServer.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // 3. User & Org
    const userEmail = `resilience-admin-${Date.now()}@test.com`;
    const signupRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Admin Resiliência',
        email: userEmail,
        password: 'Password123!'
      })
    });
    userCookie = parseCookieHeader(signupRes);
    const dbUser = await prisma.user.findUnique({ where: { email: userEmail } });
    userId = dbUser!.id;

    const org = await prisma.organization.create({
      data: {
        name: 'Yeshua Resiliência Eclesiástica',
        slug: `resilience-org-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN'
        }),
        members: {
          create: { userId, role: 'OWNER' }
        },
        settings: {
          create: { timezone: 'America/Sao_Paulo', language: 'pt-BR', aiProvider: 'LOCAL_FALLBACK' }
        },
        gpnConnection: {
          create: {
            apiUrl: gpnMockUrl,
            sessionId: `active-session-orig-${Date.now()}`,
            encryptedApiKey: CryptoService.encrypt(TEST_GPN_API_KEY),
            encryptedWebhookSecret: CryptoService.encrypt(TEST_GPN_WEBHOOK_SECRET),
            isActive: true,
            status: 'CONNECTED'
          }
        }
      }
    });
    orgId = org.id;

    // Configura canal como CONECTADO inicialmente
    await WhatsAppLifecycleService.updateSessionStatus(orgId, {
      status: 'connected',
      phone: '+5511999990001'
    });
  }, 60000);

  afterAll(async () => {
    if (appServer) await new Promise<void>((resolve) => appServer.close(() => resolve()));
    if (gpnMockServer) await new Promise<void>((resolve) => gpnMockServer.close(() => resolve()));

    try {
      if (orgId) {
        await prisma.gpnWebhookEvent.deleteMany({ where: { organizationId: orgId } });
        await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
        await prisma.followUpTask.deleteMany({ where: { organizationId: orgId } });
        await prisma.person.deleteMany({ where: { organizationId: orgId } });
        await prisma.gpnConnection.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      }
    } catch {}
  });

  // =========================================================================
  // PARTE 1: SUBSTITUIÇÃO EM DUAS FASES (TWO-PHASE REPLACEMENT)
  // =========================================================================

  it('4.1 Ao iniciar replace, CURRENT_SESSION permanece ATIVA e PENDING_SESSION vai para staging em metadata', async () => {
    const initialConn = await prisma.gpnConnection.findUnique({ where: { organizationId: orgId } });
    const initialSessionId = initialConn!.sessionId;
    expect(initialConn!.status).toBe('CONNECTED');

    // Inicia substituição
    const res = await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': orgId
      },
      body: JSON.stringify({
        confirm: true,
        reason: 'Migração para novo chip da administração'
      })
    });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.status).toBe('AGUARDANDO_QR');
    expect(json.qrCode).toBeTruthy();
    expect(json.pendingReplacement).toBeTruthy();

    // 1. Garante que gpnConnection.sessionId NÃO foi alterado e status permanece CONNECTED
    const connAfterReplace = await prisma.gpnConnection.findUnique({ where: { organizationId: orgId } });
    expect(connAfterReplace!.sessionId).toBe(initialSessionId);
    expect(connAfterReplace!.status).toBe('CONNECTED');

    // 2. Garante que pendingWhatsAppReplacement foi salvo em Organization.metadata
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const meta = JSON.parse(org!.metadata || '{}');
    expect(meta.pendingWhatsAppReplacement).toBeTruthy();
    expect(meta.pendingWhatsAppReplacement.previousSessionId).toBe(initialSessionId);
    expect(meta.pendingWhatsAppReplacement.newSessionId).toBeTruthy();
    expect(meta.pendingWhatsAppReplacement.status).toBe('AGUARDANDO_QR');
    expect(meta.pendingWhatsAppReplacement.reason).toContain('Migração para novo chip');

    // 3. Auditoria inicial registrada
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: 'WHATSAPP_NUMBER_REPLACED' }
    });
    expect(audit).toBeTruthy();
  });

  it('4.2 cancelReplaceNumber deve cancelar a substituição, limpar staging e manter sessão anterior intacta', async () => {
    const connBefore = await prisma.gpnConnection.findUnique({ where: { organizationId: orgId } });

    const cancelRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace/cancel`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': orgId
      },
      body: JSON.stringify({ reason: 'Desistência pelo operador' })
    });

    expect(cancelRes.status).toBe(200);
    const cancelJson = await cancelRes.json() as any;
    expect(cancelJson.message).toContain('cancelada');

    // 1. Staging limpo no metadata
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const meta = JSON.parse(org!.metadata || '{}');
    expect(meta.pendingWhatsAppReplacement).toBeUndefined();

    // 2. Sessão corrente permanece 100% intacta
    const connAfter = await prisma.gpnConnection.findUnique({ where: { organizationId: orgId } });
    expect(connAfter!.sessionId).toBe(connBefore!.sessionId);
    expect(connAfter!.status).toBe('CONNECTED');

    // 3. Auditoria de cancelamento registrada
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: orgId, action: 'WHATSAPP_NUMBER_REPLACE_CANCELLED' }
    });
    expect(audit).toBeTruthy();
  });

  it('4.3 Webhook session.status: connected na pendingSessionId deve promover para ativa, encerrar anterior e registrar WHATSAPP_NUMBER_REPLACED_COMPLETED', async () => {
    const connBefore = await prisma.gpnConnection.findUnique({ where: { organizationId: orgId } });
    const originalSessionId = connBefore!.sessionId;

    // Inicia nova substituição
    const replaceRes = await fetch(`${baseUrl}/api/organization/whatsapp/replace`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
        'x-organization-id': orgId
      },
      body: JSON.stringify({
        confirm: true,
        reason: 'Chip definitivo do Setor Contábil'
      })
    });
    expect(replaceRes.status).toBe(200);

    const orgAfterReplace = await prisma.organization.findUnique({ where: { id: orgId } });
    const meta = JSON.parse(orgAfterReplace!.metadata || '{}');
    const pendingSessionId = meta.pendingWhatsAppReplacement.newSessionId;
    expect(pendingSessionId).toBeTruthy();

    const newPhoneNumber = '+5511988887777';

    // Envia webhook session.status: connected direcionado à pendingSessionId
    const webhookRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: `evt_replace_promote_${Date.now()}`,
      tenantId: orgId,
      sessionId: pendingSessionId,
      data: {
        status: 'connected',
        sessionId: pendingSessionId,
        phone: newPhoneNumber,
        timestamp: Date.now()
      },
      secret: TEST_GPN_WEBHOOK_SECRET
    });

    expect(webhookRes.status).toBe(200);

    // Aguarda processamento assíncrono
    let promotedConn: any = null;
    let auditComplete: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      promotedConn = await prisma.gpnConnection.findUnique({ where: { organizationId: orgId } });
      auditComplete = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          action: 'WHATSAPP_NUMBER_REPLACED_COMPLETED'
        }
      });
      if (promotedConn?.sessionId === pendingSessionId && auditComplete) break;
    }

    // 1. Sessão nova promovida para ativa
    expect(promotedConn!.sessionId).toBe(pendingSessionId);
    expect(promotedConn!.status).toBe('CONNECTED');

    // 2. Metadados do canal atualizados
    const channelInfo = await WhatsAppLifecycleService.getStatus(orgId);
    expect(channelInfo.status).toBe('CONECTADO');
    expect(channelInfo.connectedPhone).toBe(newPhoneNumber);

    // 3. Sessão anterior encerrada no GPN
    expect(deletedSessions).toContain(originalSessionId);

    // 4. Auditoria WHATSAPP_NUMBER_REPLACED_COMPLETED registrada
    expect(auditComplete).toBeTruthy();
    expect(auditComplete!.entityId).toBe(pendingSessionId);

    // 5. Staging removido do metadata
    const finalOrg = await prisma.organization.findUnique({ where: { id: orgId } });
    const finalMeta = JSON.parse(finalOrg!.metadata || '{}');
    expect(finalMeta.pendingWhatsAppReplacement).toBeUndefined();
  });

  // =========================================================================
  // PARTE 2: INCIDENTE GPN INDEPENDENTE DE PERSON
  // =========================================================================

  it('7.1 reportGpnUnavailableAlert() SEM Person deve criar AuditLog e Organization.metadata.gpnIncident sem lançar erro', async () => {
    // Garante que NÃO existe nenhuma Person na organização de teste
    await prisma.followUpTask.deleteMany({ where: { organizationId: orgId } });
    await prisma.person.deleteMany({ where: { organizationId: orgId } });
    const personCount = await prisma.person.count({ where: { organizationId: orgId } });
    expect(personCount).toBe(0);

    // Dispara alerta operacional diretamente ou via getProviderForOrganization com status ERROR
    await prisma.gpnConnection.update({
      where: { organizationId: orgId },
      data: { status: 'ERROR' }
    });

    let caughtError: any = null;
    try {
      await WhatsAppProviderFactory.getProviderForOrganization(orgId);
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeTruthy();
    expect(caughtError.message).toContain('[GPN_UNAVAILABLE]');

    // 1. AuditLog GPN_OPERATIONAL_INCIDENT deve ter sido gerado com detalhes do erro
    const auditIncident = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgId,
        action: 'GPN_OPERATIONAL_INCIDENT'
      }
    });
    expect(auditIncident).toBeTruthy();
    const details = JSON.parse(auditIncident!.details || '{}');
    expect(details.status).toBe('ERROR');

    // 2. Organization.metadata.gpnIncident deve estar ativo
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const meta = JSON.parse(org!.metadata || '{}');
    expect(meta.gpnIncident).toBeTruthy();
    expect(meta.gpnIncident.active).toBe(true);
    expect(meta.gpnIncident.status).toBe('ERROR');
    expect(meta.gpnIncident.startedAt).toBeTruthy();

    // 3. Como não há Person, nenhuma FollowUpTask foi criada (mas sem causar erro)
    const taskCount = await prisma.followUpTask.count({ where: { organizationId: orgId } });
    expect(taskCount).toBe(0);
  });

  it('7.2 reportGpnUnavailableAlert() COM Person deve criar AuditLog, metadata E FollowUpTask URGENT', async () => {
    // Cria uma Person no banco para o tenant
    const person = await prisma.person.create({
      data: {
        organizationId: orgId,
        name: 'Pastor Silva Responsável',
        phone: '5511999998888',
        normalizedPhone: '+5511999998888'
      }
    });

    // Limpa metadata.gpnIncident para forçar novo incidente
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const meta = JSON.parse(org!.metadata || '{}');
    delete meta.gpnIncident;
    await prisma.organization.update({
      where: { id: orgId },
      data: { metadata: JSON.stringify(meta) }
    });

    await WhatsAppProviderFactory.reportGpnUnavailableAlert(orgId, 'ERROR');

    // 1. FollowUpTask com prioridade URGENT criada
    const task = await prisma.followUpTask.findFirst({
      where: {
        organizationId: orgId,
        title: { contains: 'Alerta Operacional: GPN Indisponível' },
        status: 'PENDING'
      }
    });
    expect(task).toBeTruthy();
    expect(task!.priority).toBe('URGENT');
    expect(task!.personId).toBe(person.id);

    // 2. Organization.metadata.gpnIncident ativo
    const updatedOrg = await prisma.organization.findUnique({ where: { id: orgId } });
    const updatedMeta = JSON.parse(updatedOrg!.metadata || '{}');
    expect(updatedMeta.gpnIncident?.active).toBe(true);
  });

  it('7.3 Ao receber session.status: connected, deve resolver FollowUpTasks, marcar gpnIncident inativo e registrar GPN_INCIDENT_RESOLVED', async () => {
    // Garante que há uma tarefa pendente antes da recuperação
    const pendingBefore = await prisma.followUpTask.count({
      where: { organizationId: orgId, status: 'PENDING' }
    });
    expect(pendingBefore).toBeGreaterThan(0);

    // Envia webhook session.status: connected
    const recoveryRes = await sendGpnWebhook(baseUrl, {
      event: 'session.status',
      eventId: `evt_recovery_${Date.now()}`,
      tenantId: orgId,
      data: {
        status: 'connected',
        timestamp: Date.now()
      },
      secret: TEST_GPN_WEBHOOK_SECRET
    });
    expect(recoveryRes.status).toBe(200);

    // Aguarda resolução assíncrona
    let resolvedTask: any = null;
    let resolvedAudit: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      resolvedTask = await prisma.followUpTask.findFirst({
        where: {
          organizationId: orgId,
          title: { contains: 'Alerta Operacional: GPN Indisponível' },
          status: 'COMPLETED'
        }
      });
      resolvedAudit = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          action: 'GPN_INCIDENT_RESOLVED'
        }
      });
      if (resolvedTask && resolvedAudit) break;
    }

    // 1. FollowUpTask atualizada para COMPLETED com completedAt
    expect(resolvedTask).toBeTruthy();
    expect(resolvedTask!.status).toBe('COMPLETED');
    expect(resolvedTask!.completedAt).toBeTruthy();

    // 2. Organization.metadata.gpnIncident marcado como active: false com resolvedAt
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const meta = JSON.parse(org!.metadata || '{}');
    expect(meta.gpnIncident?.active).toBe(false);
    expect(meta.gpnIncident?.resolvedAt).toBeTruthy();

    // 3. AuditLog registrado com action: GPN_INCIDENT_RESOLVED
    expect(resolvedAudit).toBeTruthy();
  });
});
