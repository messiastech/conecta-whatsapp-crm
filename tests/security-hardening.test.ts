import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { GPNWhatsAppProvider } from '../src/infrastructure/whatsapp/gpn-whatsapp.provider.js';
import { WhatsAppLifecycleService } from '../src/application/services/whatsapp-lifecycle.service.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';
import { validateProductionEnvironment } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';

describe('Security & Hardening Suite (Agente 1 — Engenheiro de Segurança)', () => {
  let mockGpnServer: http.Server;
  let mockGpnPort: number;
  let mockGpnUrl: string;
  let shouldReturnQr = true;
  let shouldFailGpn = false;

  const testOrgId = `org-hardening-${Date.now()}`;
  const testUserId = `user-hardening-${Date.now()}`;

  beforeAll(async () => {
    // Sobe mock server GPN controlado
    await new Promise<void>((resolve) => {
      mockGpnServer = http.createServer((req, res) => {
        if (shouldFailGpn) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal_error' }));
          return;
        }

        if (req.url === '/api/v1/sessions' && req.method === 'POST') {
          res.writeHead(200, { 'content-type': 'application/json' });
          if (shouldReturnQr) {
            res.end(JSON.stringify({
              ok: true,
              status: 'WAITING_QR',
              qr: '2@real_gpn_qr_code_from_gateway_valid_string'
            }));
          } else {
            res.end(JSON.stringify({
              ok: true,
              status: 'WAITING_QR'
              // sem campo qr
            }));
          }
          return;
        }

        res.writeHead(404);
        res.end();
      });

      mockGpnServer.listen(0, () => {
        const addr = mockGpnServer.address() as any;
        mockGpnPort = addr.port;
        mockGpnUrl = `http://127.0.0.1:${mockGpnPort}`;
        resolve();
      });
    });

    // Cria dados de teste no banco
    await prisma.user.create({
      data: {
        id: testUserId,
        name: 'SecOps Auditor',
        email: `secops-${Date.now()}@yeshuacontabilidade.com.br`
      }
    });

    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: 'Yeshua Hardening Test Org',
        slug: `yeshua-secops-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          preferredProvider: 'GPN'
        }),
        members: {
          create: {
            userId: testUserId,
            role: 'OWNER'
          }
        },
        gpnConnection: {
          create: {
            apiUrl: mockGpnUrl,
            sessionId: `sess-hardening-${Date.now()}`,
            encryptedApiKey: CryptoService.encrypt('valid_gpn_key_32_bytes_long_ok!'),
            encryptedWebhookSecret: CryptoService.encrypt('valid_webhook_secret_32_bytes!'),
            isActive: true,
            status: 'DISCONNECTED'
          }
        }
      }
    });
  });

  afterAll(async () => {
    if (mockGpnServer) {
      await new Promise<void>((resolve) => mockGpnServer.close(() => resolve()));
    }
    await prisma.auditLog.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.followUpTask.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.whatsAppConnection.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.gpnConnection.deleteMany({ where: { organizationId: testOrgId } }).catch(() => {});
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  // =========================================================================
  // 1. PROIBIR QR SIMULADO EM PRODUÇÃO
  // =========================================================================
  describe('1. Proibição de QR Code Simulado em Produção', () => {
    it('GPNWhatsAppProvider.startSession deve lançar [GPN_UNAVAILABLE] em produção se o gateway falhar', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const provider = new GPNWhatsAppProvider({
        apiUrl: 'http://127.0.0.1:9999', // porta inexistente para forçar erro de conexão
        apiKey: 'test_key',
        sessionId: 'test_session'
      });

      await expect(provider.startSession('test_session')).rejects.toThrow(/\[GPN_UNAVAILABLE\]/);

      process.env.NODE_ENV = originalNodeEnv;
    });

    it('GPNWhatsAppProvider.startSession NUNCA deve retornar QR simulado em produção', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      shouldFailGpn = false;
      shouldReturnQr = false; // gateway responde ok mas sem QR

      const provider = new GPNWhatsAppProvider({
        apiUrl: mockGpnUrl,
        apiKey: 'test_key',
        sessionId: 'test_session'
      });

      await expect(provider.startSession('test_session')).rejects.toThrow(/\[GPN_UNAVAILABLE\]/);

      process.env.NODE_ENV = originalNodeEnv;
      shouldReturnQr = true;
    });

    it('WhatsAppLifecycleService.connect deve lançar [GPN_UNAVAILABLE] se o gateway não fornecer QR real', async () => {
      shouldReturnQr = false; // simula gateway sem QR

      await expect(WhatsAppLifecycleService.connect(testOrgId)).rejects.toThrow(/\[GPN_UNAVAILABLE\]/);

      shouldReturnQr = true;
    });
  });

  // =========================================================================
  // 2. FAIL-FAST DAS CREDENCIAIS GPN
  // =========================================================================
  describe('2. Fail-Fast das Credenciais GPN', () => {
    it('validateProductionEnvironment deve abortar se faltarem credenciais GPN na vertical ACCOUNTING', () => {
      const origEnv = { ...process.env };
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      process.env.BETTER_AUTH_SECRET = 'a_very_secure_secret_with_more_than_32_characters_123';
      process.env.BETTER_AUTH_URL = 'https://yeshua.onrender.com';
      process.env.ENCRYPTION_MASTER_KEY = 'master_encryption_key_32_chars_long!';
      process.env.VERTICAL_PROFILE = 'ACCOUNTING';
      process.env.YESHUA_DEMO_EMAIL = 'admin@yeshua.com';
      process.env.YESHUA_DEMO_PASSWORD = 'password';

      delete process.env.GPN_API_URL;
      delete process.env.GPN_API_KEY;
      delete process.env.GPN_WEBHOOK_SECRET;

      expect(() => validateProductionEnvironment()).toThrow(/GPN_API_URL/);

      Object.assign(process.env, origEnv);
    });

    it('WhatsAppLifecycleService.getGpnConfig deve falhar em produção se faltar API Key ou URL', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const origApiKey = process.env.GPN_API_KEY;
      process.env.NODE_ENV = 'production';
      delete process.env.GPN_API_KEY;

      expect(() => WhatsAppLifecycleService.getGpnConfig({
        apiUrl: 'https://gpn.infra.prod',
        encryptedApiKey: null
      })).toThrow(/\[GPN_CONFIG_ERROR\]/);

      process.env.NODE_ENV = originalNodeEnv;
      if (origApiKey) process.env.GPN_API_KEY = origApiKey;
    });
  });

  // =========================================================================
  // 3. NÃO EXPOR sessionId AO CLIENTE
  // =========================================================================
  describe('3. Proteção e Omissão Estrita de sessionId', () => {
    it('WhatsAppLifecycleService.getStatus não deve conter sessionId na interface de retorno', async () => {
      const statusInfo = await WhatsAppLifecycleService.getStatus(testOrgId);
      expect((statusInfo as any).sessionId).toBeUndefined();
    });

    it('WhatsAppLifecycleService.connect não deve conter sessionId na resposta pública', async () => {
      shouldReturnQr = true;
      shouldFailGpn = false;
      const connectInfo = await WhatsAppLifecycleService.connect(testOrgId);
      expect((connectInfo as any).sessionId).toBeUndefined();
      expect(connectInfo.qrCode).toContain('real_gpn_qr_code');
    });
  });

  // =========================================================================
  // 5. META COMO CONTINGÊNCIA EXPLÍCITA
  // =========================================================================
  describe('5. Meta como Provedor de Contingência com Autorização Explícita', () => {
    it('deve rejeitar Meta em ACCOUNTING se metaContingencyApproved não for true', async () => {
      // Cria WhatsAppConnection para simular Meta
      await prisma.whatsAppConnection.upsert({
        where: { organizationId: testOrgId },
        create: {
          organizationId: testOrgId,
          phoneNumberId: 'meta_phone_123',
          wabaId: 'waba_123',
          encryptedAccessToken: CryptoService.encrypt('access_token_123'),
          encryptedAppSecret: CryptoService.encrypt('app_secret_123'),
          isMock: false,
          status: 'CONNECTED'
        },
        update: {
          phoneNumberId: 'meta_phone_123',
          isMock: false,
          status: 'CONNECTED'
        }
      });

      // Configura preferredProvider = META SEM metaContingencyApproved
      await prisma.organization.update({
        where: { id: testOrgId },
        data: {
          metadata: JSON.stringify({
            verticalProfile: 'ACCOUNTING',
            preferredProvider: 'META',
            metaContingencyApproved: false
          })
        }
      });

      await expect(WhatsAppProviderFactory.getProviderForOrganization(testOrgId))
        .rejects.toThrow(/\[WHATSAPP_PROD_ERROR\] Provedor Meta não autorizado para o perfil ACCOUNTING sem aprovação administrativa deliberada/);
    });

    it('deve permitir Meta em ACCOUNTING quando preferredProvider === "META" E metaContingencyApproved === true', async () => {
      await prisma.organization.update({
        where: { id: testOrgId },
        data: {
          metadata: JSON.stringify({
            verticalProfile: 'ACCOUNTING',
            preferredProvider: 'META',
            metaContingencyApproved: true
          })
        }
      });

      const provider = await WhatsAppProviderFactory.getProviderForOrganization(testOrgId);
      expect(provider).toBeDefined();

      const providerType = await WhatsAppProviderFactory.getProviderType(testOrgId);
      expect(providerType).toBe('META');
    });
  });

  // =========================================================================
  // 6. MOCK PROIBIDO EM PRODUÇÃO YESHUA
  // =========================================================================
  describe('6. Proibição Absoluta de MockWhatsAppProvider em Produção para ACCOUNTING', () => {
    it('WhatsAppProviderFactory deve lançar [WHATSAPP_PROD_ERROR] e NUNCA retornar Mock em produção para Yeshua', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Cria organização sem GPN ativo e sem Meta
      const unconfiguredOrgId = `org-no-prov-${Date.now()}`;
      await prisma.organization.create({
        data: {
          id: unconfiguredOrgId,
          name: 'Unconfigured Church',
          slug: `unconfigured-${Date.now()}`,
          metadata: JSON.stringify({
            verticalProfile: 'ACCOUNTING',
            preferredProvider: 'GPN'
          })
        }
      });

      try {
        await expect(WhatsAppProviderFactory.getProviderForOrganization(unconfiguredOrgId))
          .rejects.toThrow(/\[WHATSAPP_PROD_ERROR\]/);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        await prisma.organization.delete({ where: { id: unconfiguredOrgId } }).catch(() => {});
      }
    });
  });
});
