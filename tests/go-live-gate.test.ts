import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { initYeshuaProduction } from '../src/infrastructure/database/init-yeshua-production.js';
import { WhatsAppLifecycleService } from '../src/application/services/whatsapp-lifecycle.service.js';
import { WhatsAppProviderFactory } from '../src/infrastructure/whatsapp/whatsapp-provider.factory.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';

describe('Go-Live Gate Production Blocker Verifications (Suíte Go-Live)', () => {
  const originalEnv = { ...process.env };
  const testAdminEmail = `golive-admin-${Date.now()}@yeshuacontabilidade.com.br`;
  const testAdminPass = 'SuperSecretProdPassword2026!';
  let createdOrgId: string;

  beforeAll(() => {
    process.env.YESHUA_ADMIN_EMAIL = testAdminEmail;
    process.env.YESHUA_ADMIN_PASSWORD = testAdminPass;
    process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';
  });

  afterAll(async () => {
    // Restaura ambiente
    process.env = { ...originalEnv };
    try {
      if (createdOrgId) {
        await prisma.member.deleteMany({ where: { organizationId: createdOrgId } });
        await prisma.organizationSettings.deleteMany({ where: { organizationId: createdOrgId } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: createdOrgId } });
        await prisma.gpnConnection.deleteMany({ where: { organizationId: createdOrgId } });
        await prisma.organization.delete({ where: { id: createdOrgId } });
      }
      const u = await prisma.user.findUnique({ where: { email: testAdminEmail } });
      if (u) {
        await prisma.account.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    } catch {}
  });

  // --------------------------------------------------------------------------
  // 1. DOCKER-ENTRYPOINT.SH E SCHEMA PREPARATION
  // --------------------------------------------------------------------------
  it('1. docker-entrypoint.sh NUNCA deve conter --accept-data-loss e deve separar release do boot', () => {
    const entrypointPath = path.resolve(process.cwd(), 'docker-entrypoint.sh');
    const content = fs.readFileSync(entrypointPath, 'utf-8');

    // NUNCA aceitar perda de dados
    expect(content).not.toContain('--accept-data-loss');

    // Deve separar release phase do boot normal
    expect(content).toContain('RELEASE PHASE');
    expect(content).toContain('BOOT');
    expect(content).toContain('prisma db push --skip-generate');
    expect(content).toContain('exec "$@"');
  });

  // --------------------------------------------------------------------------
  // 2. IDEMPOTÊNCIA E PRESERVAÇÃO DE METADADOS EM INITYESHUAPRODUCTION
  // --------------------------------------------------------------------------
  it('2. initYeshuaProduction deve ser 100% idempotente, preservar senha de usuário e mesclar metadata', async () => {
    // Primeira execução: cria usuário e organização
    const result1 = await initYeshuaProduction();
    createdOrgId = result1.orgId;

    // Busca conta do usuário e captura hash de senha original
    const account1 = await prisma.account.findFirst({
      where: { userId: result1.userId, providerId: 'credential' }
    });
    expect(account1).toBeTruthy();
    const originalPasswordHash = account1!.password;

    // Injeta metadados operacionais dinâmicos na organização (simulando canal conectado, incidente, pending replacement)
    const activeChannelData = {
      status: 'CONECTADO',
      connectedPhone: '+5511988887777',
      connectedAt: '2026-09-22T10:00:00.000Z',
      provider: 'GPN',
      isOperating: true
    };
    const pendingReplacementData = {
      previousSessionId: 'sess_prev_123',
      newSessionId: 'sess_new_456',
      status: 'AGUARDANDO_QR',
      qrCode: '2@gpn_test_qr_pending'
    };
    const gpnIncidentData = {
      active: false,
      resolvedAt: '2026-09-22T10:05:00.000Z'
    };

    const customMetadata = {
      verticalProfile: 'ACCOUNTING',
      brandName: 'YESHUA DESK IGREJAS',
      whatsappChannel: activeChannelData,
      pendingWhatsAppReplacement: pendingReplacementData,
      gpnIncident: gpnIncidentData,
      preferredProvider: 'GPN',
      customFeatureFlag: 'enabled_for_pilot'
    };

    await prisma.organization.update({
      where: { id: createdOrgId },
      data: { metadata: JSON.stringify(customMetadata) }
    });

    // Segunda execução: restart do container
    // Modifica propositalmente YESHUA_ADMIN_PASSWORD no env para simular restart sem que a senha seja alterada
    process.env.YESHUA_ADMIN_PASSWORD = 'DifferentAttemptedPassword!';

    const result2 = await initYeshuaProduction();
    expect(result2.orgId).toBe(createdOrgId);
    expect(result2.userId).toBe(result1.userId);

    // 2.1 Verifica que a senha do usuário NÃO foi redefinida/sobrescrita no restart
    const account2 = await prisma.account.findFirst({
      where: { userId: result1.userId, providerId: 'credential' }
    });
    expect(account2!.password).toBe(originalPasswordHash);

    // 2.2 Verifica que os metadados NÃO foram substituídos integralmente e preservaram todos os campos operacionais
    const updatedOrg = await prisma.organization.findUnique({ where: { id: createdOrgId } });
    const parsedMeta = JSON.parse(updatedOrg!.metadata!);

    expect(parsedMeta.verticalProfile).toBe('ACCOUNTING');
    expect(parsedMeta.brandName).toBe('YESHUA DESK IGREJAS');
    expect(parsedMeta.whatsappChannel).toEqual(activeChannelData);
    expect(parsedMeta.pendingWhatsAppReplacement).toEqual(pendingReplacementData);
    expect(parsedMeta.gpnIncident).toEqual(gpnIncidentData);
    expect(parsedMeta.preferredProvider).toBe('GPN');
    expect(parsedMeta.customFeatureFlag).toBe('enabled_for_pilot');
  });

  // --------------------------------------------------------------------------
  // 3. FONTE AUTORITATIVA DE GPN_API_URL EM PRODUÇÃO
  // --------------------------------------------------------------------------
  it('3. process.env.GPN_API_URL deve ser a fonte autoritativa da infraestrutura em produção', async () => {
    const authoritativeUrl = 'https://gpn.mega-infra.prod.internal';
    const staleStoredUrl = 'http://old-localhost:3000';

    const testGpnConnection = {
      apiUrl: staleStoredUrl,
      sessionId: 'test-session-auth',
      encryptedApiKey: CryptoService.encrypt('gpn_test_key_12345'),
      encryptedWebhookSecret: CryptoService.encrypt('gpn_webhook_secret_min16chars!'),
      isActive: true,
      status: 'CONNECTED'
    };

    // 3.1 Em modo de produção (NODE_ENV=production), GPN_API_URL sobrescreve a URL do banco
    process.env.NODE_ENV = 'production';
    process.env.GPN_API_URL = authoritativeUrl;

    const configProd = WhatsAppLifecycleService.getGpnConfig(testGpnConnection);
    expect(configProd.apiUrl).toBe(authoritativeUrl);
    expect(configProd.apiUrl).not.toBe(staleStoredUrl);

    // 3.2 Validação na WhatsAppProviderFactory
    // Cria organização com URL antiga no banco
    const orgWithStaleUrl = await prisma.organization.create({
      data: {
        name: `Org Stale URL Test ${Date.now()}`,
        slug: `org-stale-${Date.now()}`,
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING', preferredProvider: 'GPN' }),
        gpnConnection: {
          create: {
            apiUrl: staleStoredUrl,
            sessionId: 'sess-stale-test',
            encryptedApiKey: CryptoService.encrypt('gpn_key_32bytes_valid_sample!'),
            encryptedWebhookSecret: CryptoService.encrypt('gpn_secret_32bytes_sample!'),
            isActive: true,
            status: 'CONNECTED'
          }
        }
      }
    });

    try {
      const provider = await WhatsAppProviderFactory.getProviderForOrganization(orgWithStaleUrl.id);
      expect((provider as any).config.apiUrl).toBe(authoritativeUrl);
      expect((provider as any).config.apiUrl).not.toBe(staleStoredUrl);
    } finally {
      await prisma.gpnConnection.deleteMany({ where: { organizationId: orgWithStaleUrl.id } });
      await prisma.organization.delete({ where: { id: orgWithStaleUrl.id } });
    }
  });

  // --------------------------------------------------------------------------
  // 4. MANIFESTOS DE DEPLOYMENT (RAILWAY / DOCKER / HEALTHCHECK)
  // --------------------------------------------------------------------------
  it('4. railway.json e railway.toml devem estar preparados para MEGA APP stateless e /health', () => {
    const railwayJsonPath = path.resolve(process.cwd(), 'railway.json');
    const railwayTomlPath = path.resolve(process.cwd(), 'railway.toml');

    expect(fs.existsSync(railwayJsonPath)).toBe(true);
    expect(fs.existsSync(railwayTomlPath)).toBe(true);

    const json = JSON.parse(fs.readFileSync(railwayJsonPath, 'utf-8'));
    expect(json.build.builder).toBe('DOCKERFILE');
    expect(json.deploy.healthcheckPath).toBe('/health');

    const toml = fs.readFileSync(railwayTomlPath, 'utf-8');
    expect(toml).toContain('healthcheckPath = "/health"');
    expect(toml).toContain('builder = "DOCKERFILE"');
  });

  // --------------------------------------------------------------------------
  // 5. MANIFESTOS RENDER E FLY NÃO SÃO PRODUÇÃO PRINCIPAL E NÃO USAM MOCK
  // --------------------------------------------------------------------------
  it('5. render.yaml e fly.toml devem ser secundários e NÃO utilizar provedor mock', () => {
    const renderPath = path.resolve(process.cwd(), 'render.yaml');
    const flyPath = path.resolve(process.cwd(), 'fly.toml');

    const renderContent = fs.readFileSync(renderPath, 'utf-8');
    const flyContent = fs.readFileSync(flyPath, 'utf-8');

    // Ambos devem utilizar gpn, não mock
    expect(renderContent).not.toMatch(/value:\s*mock/);
    expect(flyContent).not.toMatch(/WHATSAPP_PROVIDER\s*=\s*"mock"/);

    // fly.toml não deve conter --accept-data-loss
    expect(flyContent).not.toContain('--accept-data-loss');

    // Ambos documentam explicitamente que Railway é a produção principal
    expect(renderContent).toContain('Railway/Docker');
    expect(flyContent).toContain('Railway/Docker');
  });
});
