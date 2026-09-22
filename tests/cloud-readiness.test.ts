import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { buildApp, validateProductionEnvironment } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';

describe('Suíte de Testes de Observabilidade e Prontidão em Produção (Cloud Readiness)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = buildApp();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // =========================================================================
  // 1. ENDPOINT /health
  // =========================================================================
  describe('Endpoint /health - Observabilidade e Monitoramento Seguro', () => {
    it('deve retornar status 200, uptime, timestamp, verticalProfile e database sem vazar dados sensíveis', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);

      const data = await res.json() as any;

      // 1. Campos obrigatórios
      expect(data.status).toBe('OK');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof data.timestamp).toBe('string');
      expect(new Date(data.timestamp).getTime()).not.toBeNaN();
      expect(data.verticalProfile).toBeDefined();
      expect(data.database).toBeDefined();
      expect(data.database.status).toBe('connected');

      // 2. Não-vazamento de dados sensíveis
      const rawJson = JSON.stringify(data);
      expect(rawJson).not.toContain('postgres://');
      expect(rawJson).not.toContain('postgresql://');
      expect(rawJson).not.toContain('password');
      expect(rawJson).not.toContain('secret');
      expect(rawJson).not.toContain(process.env.ENCRYPTION_MASTER_KEY || 'master_key');
    });

    it('deve retornar verticalProfile = "ACCOUNTING" quando VERTICAL_PROFILE estiver configurado', async () => {
      const origProfile = process.env.VERTICAL_PROFILE;
      process.env.VERTICAL_PROFILE = 'ACCOUNTING';

      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.verticalProfile).toBe('ACCOUNTING');

      process.env.VERTICAL_PROFILE = origProfile;
    });
  });

  // =========================================================================
  // 2. FAIL-FAST EM PRODUÇÃO (validateProductionEnvironment)
  // =========================================================================
  describe('Mecanismo Fail-Fast de Inicialização em Produção (NODE_ENV=production)', () => {
    const originalEnv = { ...process.env };

    afterAll(() => {
      process.env = { ...originalEnv };
    });

    const setValidProductionEnv = () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@host.neon.tech/db?sslmode=require';
      process.env.BETTER_AUTH_SECRET = 'a_very_secure_secret_with_more_than_32_characters_123';
      process.env.BETTER_AUTH_URL = 'https://yeshua-demo.onrender.com';
      process.env.ENCRYPTION_MASTER_KEY = 'master_encryption_key_32_chars_long!';
      process.env.VERTICAL_PROFILE = 'ACCOUNTING';
      process.env.YESHUA_DEMO_EMAIL = 'demo@yeshuacontabilidade.com.br';
      process.env.YESHUA_DEMO_PASSWORD = 'demo';
      delete process.env.WHATSAPP_PROVIDER;
    };

    it('deve iniciar com sucesso quando todas as variáveis de produção estiverem corretas', () => {
      setValidProductionEnv();
      expect(() => validateProductionEnvironment()).not.toThrow();
    });

    it('deve abortar startup se DATABASE_URL estiver ausente ou inválida', () => {
      setValidProductionEnv();
      delete process.env.DATABASE_URL;
      expect(() => validateProductionEnvironment()).toThrow(/DATABASE_URL/);

      process.env.DATABASE_URL = 'sqlite://invalid.db';
      expect(() => validateProductionEnvironment()).toThrow(/DATABASE_URL/);
    });

    it('deve abortar startup se BETTER_AUTH_SECRET estiver ausente ou tiver menos de 32 chars', () => {
      setValidProductionEnv();
      delete process.env.BETTER_AUTH_SECRET;
      expect(() => validateProductionEnvironment()).toThrow(/BETTER_AUTH_SECRET/);

      process.env.BETTER_AUTH_SECRET = 'curto_demais';
      expect(() => validateProductionEnvironment()).toThrow(/BETTER_AUTH_SECRET/);
    });

    it('deve abortar startup se BETTER_AUTH_URL estiver ausente ou não for URL válida', () => {
      setValidProductionEnv();
      delete process.env.BETTER_AUTH_URL;
      expect(() => validateProductionEnvironment()).toThrow(/BETTER_AUTH_URL/);

      process.env.BETTER_AUTH_URL = 'not-a-valid-url';
      expect(() => validateProductionEnvironment()).toThrow(/BETTER_AUTH_URL/);
    });

    it('deve abortar startup se ENCRYPTION_MASTER_KEY estiver ausente ou tiver menos de 32 chars', () => {
      setValidProductionEnv();
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(() => validateProductionEnvironment()).toThrow(/ENCRYPTION_MASTER_KEY/);

      process.env.ENCRYPTION_MASTER_KEY = 'short_key';
      expect(() => validateProductionEnvironment()).toThrow(/ENCRYPTION_MASTER_KEY/);
    });

    it('deve abortar startup se YESHUA_DEMO_EMAIL ou YESHUA_DEMO_PASSWORD faltarem na vertical ACCOUNTING', () => {
      setValidProductionEnv();
      delete process.env.YESHUA_DEMO_EMAIL;
      delete process.env.YESHUA_ADMIN_EMAIL;
      expect(() => validateProductionEnvironment()).toThrow(/YESHUA_DEMO_EMAIL/);

      setValidProductionEnv();
      delete process.env.YESHUA_DEMO_PASSWORD;
      delete process.env.YESHUA_ADMIN_PASSWORD;
      expect(() => validateProductionEnvironment()).toThrow(/YESHUA_DEMO_PASSWORD/);
    });

    it('deve abortar startup se WHATSAPP_PROVIDER=meta e META_WEBHOOK_VERIFY_TOKEN faltar', () => {
      setValidProductionEnv();
      process.env.WHATSAPP_PROVIDER = 'meta';
      delete process.env.META_WEBHOOK_VERIFY_TOKEN;
      expect(() => validateProductionEnvironment()).toThrow(/META_WEBHOOK_VERIFY_TOKEN/);
    });
  });

  // =========================================================================
  // 3. ENDPOINT /api/public-config
  // =========================================================================
  describe('Endpoint /api/public-config - Transparência Pública sem Vazamentos', () => {
    it('deve expor configurações de branding sem credenciais', async () => {
      const res = await fetch(`${baseUrl}/api/public-config`);
      expect(res.status).toBe(200);

      const config = await res.json() as any;
      expect(config.verticalProfile).toBeDefined();
      expect(typeof config.allowPublicSignup).toBe('boolean');
      expect(config.brandName).toBeDefined();
      expect(config.brandSubtitle).toBeDefined();

      const raw = JSON.stringify(config);
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('secret');
    });
  });
});
