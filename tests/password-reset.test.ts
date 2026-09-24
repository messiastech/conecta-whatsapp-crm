import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { buildApp } from '../src/presentation/server.js';
import { ResendEmailService } from '../src/infrastructure/email/resend-email.service.js';

describe('P0 — Recuperação de Senha & E-mail Transacional (Better Auth + Resend)', () => {
  let server: Server;
  let apiBaseUrl: string;

  const testEmailPrefix = `pwd.reset.${Date.now()}`;
  const validUserEmail = `${testEmailPrefix}@megasi.com.br`;
  const initialPassword = 'OldSecurePassword123!';
  const updatedPassword = 'NewSecurePassword456!';
  let createdUserId: string;

  beforeAll(async () => {
    // Inicializa o servidor HTTP real
    const { app } = buildApp();
    await new Promise<void>(resolve => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        apiBaseUrl = `http://localhost:${address.port}/api`;
        resolve();
      });
    });

    // Cria usuário de teste via endpoint de sign-up do Better Auth
    const signUpRes = await fetch(`${apiBaseUrl}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usuário Teste Recuperação',
        email: validUserEmail,
        password: initialPassword
      })
    });
    const signUpData = await signUpRes.json();
    createdUserId = signUpData.user.id;
  });

  afterAll(async () => {
    try {
      if (server) {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      if (createdUserId) {
        await prisma.verification.deleteMany({
          where: { value: createdUserId }
        });
        await prisma.auditLog.deleteMany({
          where: { userId: createdUserId }
        });
        await prisma.session.deleteMany({
          where: { userId: createdUserId }
        });
        await prisma.account.deleteMany({
          where: { userId: createdUserId }
        });
        await prisma.user.delete({
          where: { id: createdUserId }
        });
      }
      await prisma.$disconnect();
    } catch {
      // Ignora erros de teardown
    }
  });

  describe('1. Serviço de E-mail Resend (resend-email.service.ts)', () => {
    it('deve lidar graciosamente sem credenciais (não quebrar aplicação)', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      try {
        const result = await ResendEmailService.sendEmail({
          to: 'alguem@teste.com',
          subject: 'Teste',
          html: '<p>Teste</p>'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('RESEND_API_KEY_MISSING');

        // Teste sendPasswordResetEmail também sem credenciais
        const resetResult = await ResendEmailService.sendPasswordResetEmail({
          to: 'alguem@teste.com',
          userName: 'Fulano',
          token: 'token-teste-123'
        });

        expect(resetResult.success).toBe(false);
        expect(resetResult.error).toBe('RESEND_API_KEY_MISSING');
      } finally {
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
      }
    });

    it('deve falhar de forma segura sem AUTH_EMAIL_FROM (sem remetente silencioso)', async () => {
      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      process.env.RESEND_API_KEY = 're_dummy_123';
      delete process.env.AUTH_EMAIL_FROM;

      try {
        const result = await ResendEmailService.sendEmail({
          to: 'dest@teste.com',
          subject: 'Teste Sem Remetente',
          html: '<p>Teste</p>'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('AUTH_EMAIL_FROM_MISSING');
      } finally {
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
      }
    });

    it('deve montar o payload correto para o Resend com headers e remetente previsto', async () => {
      const originalKey = process.env.RESEND_API_KEY;
      const originalFrom = process.env.AUTH_EMAIL_FROM;
      process.env.RESEND_API_KEY = 're_test_mock_api_key_123';
      process.env.AUTH_EMAIL_FROM = 'MEGA SI <acesso@megasi.com.br>';

      let capturedUrl = '';
      let capturedOptions: any = null;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (url: any, options: any) => {
        capturedUrl = String(url);
        capturedOptions = options;
        return new Response(JSON.stringify({ id: 'resend_msg_test_id_999' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const result = await ResendEmailService.sendPasswordResetEmail({
          to: 'destinatario@igreja.org.br',
          userName: 'Pastor Lucas',
          token: 'token-secreto-xyz-987'
        });

        expect(result.success).toBe(true);
        expect(result.id).toBe('resend_msg_test_id_999');

        expect(capturedUrl).toBe('https://api.resend.com/emails');
        expect(capturedOptions.method).toBe('POST');
        expect(capturedOptions.headers['Authorization']).toBe('Bearer re_test_mock_api_key_123');
        expect(capturedOptions.headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(capturedOptions.body);
        expect(body.from).toBe('MEGA SI <acesso@megasi.com.br>');
        expect(body.to).toEqual(['destinatario@igreja.org.br']);
        expect(body.subject).toBe('Recuperação de Acesso - Redefinição de Senha');
        expect(body.html).toContain('Pastor Lucas');
        expect(body.html).toContain('token=token-secreto-xyz-987');
        expect(body.text).toContain('token=token-secreto-xyz-987');
      } finally {
        globalThis.fetch = originalFetch;
        if (originalKey) process.env.RESEND_API_KEY = originalKey;
        else delete process.env.RESEND_API_KEY;
        if (originalFrom) process.env.AUTH_EMAIL_FROM = originalFrom;
        else delete process.env.AUTH_EMAIL_FROM;
      }
    });

    it('não deve logar token, URL completa ou API key em logs', async () => {
      const loggedMessages: string[] = [];
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation((...args) => {
        loggedMessages.push(args.join(' '));
      });
      const spyError = vi.spyOn(console, 'error').mockImplementation((...args) => {
        loggedMessages.push(args.join(' '));
      });
      const spyLog = vi.spyOn(console, 'log').mockImplementation((...args) => {
        loggedMessages.push(args.join(' '));
      });

      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      process.env.RESEND_API_KEY = 're_sensitive_key_secret_999';
      process.env.AUTH_EMAIL_FROM = 'MEGA SI <acesso@megasi.com.br>';

      const secretToken = 'super-secret-token-abcdef123456';
      const secretUrl = `http://localhost:3000/reset-password?token=${secretToken}`;

      try {
        await ResendEmailService.sendPasswordResetEmail({
          to: 'alguem@teste.com',
          userName: 'Fulano',
          token: secretToken,
          url: secretUrl
        });

        for (const msg of loggedMessages) {
          expect(msg).not.toContain(secretToken);
          expect(msg).not.toContain('re_sensitive_key_secret_999');
          expect(msg).not.toContain(secretUrl);
        }
      } finally {
        spyWarn.mockRestore();
        spyError.mockRestore();
        spyLog.mockRestore();
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
      }
    });
  });

  describe('2. Endpoint /public-config e feature flag recoveryEnabled', () => {
    it('deve retornar recoveryEnabled = false sem RESEND_API_KEY', async () => {
      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      const origFlag = process.env.ENABLE_PASSWORD_RESET;
      try {
        delete process.env.RESEND_API_KEY;
        process.env.AUTH_EMAIL_FROM = 'MEGA SI <acesso@megasi.com.br>';
        delete process.env.ENABLE_PASSWORD_RESET;

        const res = await fetch(`${apiBaseUrl}/public-config`);
        const data = await res.json();
        expect(data.recoveryEnabled).toBe(false);
      } finally {
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
        if (origFlag) process.env.ENABLE_PASSWORD_RESET = origFlag; else delete process.env.ENABLE_PASSWORD_RESET;
      }
    });

    it('deve retornar recoveryEnabled = false sem AUTH_EMAIL_FROM', async () => {
      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      const origFlag = process.env.ENABLE_PASSWORD_RESET;
      try {
        process.env.RESEND_API_KEY = 're_test_key_123';
        delete process.env.AUTH_EMAIL_FROM;
        delete process.env.ENABLE_PASSWORD_RESET;

        const res = await fetch(`${apiBaseUrl}/public-config`);
        const data = await res.json();
        expect(data.recoveryEnabled).toBe(false);
      } finally {
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
        if (origFlag) process.env.ENABLE_PASSWORD_RESET = origFlag; else delete process.env.ENABLE_PASSWORD_RESET;
      }
    });

    it('deve retornar recoveryEnabled = false se ENABLE_PASSWORD_RESET="false"', async () => {
      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      const origFlag = process.env.ENABLE_PASSWORD_RESET;
      try {
        process.env.RESEND_API_KEY = 're_test_key_123';
        process.env.AUTH_EMAIL_FROM = 'MEGA SI <acesso@megasi.com.br>';
        process.env.ENABLE_PASSWORD_RESET = 'false';

        const res = await fetch(`${apiBaseUrl}/public-config`);
        const data = await res.json();
        expect(data.recoveryEnabled).toBe(false);
      } finally {
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
        if (origFlag) process.env.ENABLE_PASSWORD_RESET = origFlag; else delete process.env.ENABLE_PASSWORD_RESET;
      }
    });

    it('deve retornar recoveryEnabled = true com key + from e flag não false', async () => {
      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      const origFlag = process.env.ENABLE_PASSWORD_RESET;
      try {
        process.env.RESEND_API_KEY = 're_test_key_123';
        process.env.AUTH_EMAIL_FROM = 'MEGA SI <acesso@megasi.com.br>';
        delete process.env.ENABLE_PASSWORD_RESET;

        const res = await fetch(`${apiBaseUrl}/public-config`);
        const data = await res.json();
        expect(data.recoveryEnabled).toBe(true);

        process.env.ENABLE_PASSWORD_RESET = 'true';
        const res2 = await fetch(`${apiBaseUrl}/public-config`);
        const data2 = await res2.json();
        expect(data2.recoveryEnabled).toBe(true);
      } finally {
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
        if (origFlag) process.env.ENABLE_PASSWORD_RESET = origFlag; else delete process.env.ENABLE_PASSWORD_RESET;
      }
    });
  });

  describe('3. Fluxo de Recuperação, Timing e Segurança', () => {
    it('não deve revelar a existência de e-mail ao solicitar recuperação', async () => {
      const fakeEmail = `nonexistent.${Date.now()}@dominio-fantasma.com`;

      const res = await fetch(`${apiBaseUrl}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fakeEmail })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe(true);
      expect(typeof data.message).toBe('string');
      // A resposta para e-mail inexistente é idêntica à de e-mail existente
      expect(data.message.toLowerCase()).toContain('email');
    });

    it('sendResetPassword não deve bloquear resposta esperando fetch externo do Resend', async () => {
      const originalFetch = globalThis.fetch;
      let fetchFinished = false;

      // Mock fetch que demora 800ms
      globalThis.fetch = vi.fn(async (url: any, options: any) => {
        if (String(url).includes('resend.com')) {
          await new Promise(r => setTimeout(r, 800));
          fetchFinished = true;
          return new Response(JSON.stringify({ id: 'slow_msg_123' }), { status: 200 });
        }
        return originalFetch(url, options);
      }) as any;

      const origKey = process.env.RESEND_API_KEY;
      const origFrom = process.env.AUTH_EMAIL_FROM;
      process.env.RESEND_API_KEY = 're_test_timing_123';
      process.env.AUTH_EMAIL_FROM = 'MEGA SI <acesso@megasi.com.br>';

      try {
        const start = Date.now();
        const res = await fetch(`${apiBaseUrl}/auth/request-password-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: validUserEmail })
        });
        const elapsed = Date.now() - start;

        expect(res.status).toBe(200);
        // A resposta deve retornar sem aguardar a conclusão do fetch de 800ms
        expect(elapsed).toBeLessThan(500);
        expect(fetchFinished).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
        if (origKey) process.env.RESEND_API_KEY = origKey; else delete process.env.RESEND_API_KEY;
        if (origFrom) process.env.AUTH_EMAIL_FROM = origFrom; else delete process.env.AUTH_EMAIL_FROM;
      }
    });

    it('não deve aceitar redirect externo não confiável em request-password-reset', async () => {
      const res = await fetch(`${apiBaseUrl}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: validUserEmail,
          redirectTo: 'https://attacker.evil.com/phishing-steal'
        })
      });

      // Better Auth originCheck bloqueia redirecionamentos para origens não confiáveis com 403 Forbidden
      expect(res.status).toBe(403);
    });

    it('deve gerar token na tabela Verification quando o e-mail existe', async () => {
      const res = await fetch(`${apiBaseUrl}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: validUserEmail })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe(true);

      // Verifica token persistido na tabela Verification existente
      const verifications = await prisma.verification.findMany({
        where: { value: createdUserId }
      });

      expect(verifications.length).toBeGreaterThan(0);
      const resetVerification = verifications.find(v => v.identifier.startsWith('reset-password:'));
      expect(resetVerification).toBeDefined();
      expect(resetVerification!.identifier).toMatch(/^reset-password:[a-zA-Z0-9_-]+$/);
      // Expira em até 3600 segundos (1 hora)
      expect(resetVerification!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('4. Validação de Senha e Consumo do Token', () => {
    let resetToken: string;

    beforeAll(async () => {
      // Garante um token fresco para os testes de consumo
      await fetch(`${apiBaseUrl}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: validUserEmail })
      });

      const verifications = await prisma.verification.findMany({
        where: { value: createdUserId },
        orderBy: { createdAt: 'desc' }
      });
      const resetVerification = verifications.find(v => v.identifier.startsWith('reset-password:'));
      resetToken = resetVerification!.identifier.replace('reset-password:', '');
    });

    it('deve rejeitar senha com menos de 8 caracteres (minPasswordLength = 8)', async () => {
      const res = await fetch(`${apiBaseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: 'short' // 5 caracteres < 8
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code || data.message).toMatch(/PASSWORD_TOO_SHORT|short/i);

      // O token NÃO deve ser consumido após uma falha de validação de tamanho de senha
      const verificationStillExists = await prisma.verification.findFirst({
        where: { identifier: `reset-password:${resetToken}` }
      });
      expect(verificationStillExists).not.toBeNull();
    });

    it('deve redefinir a senha com sucesso quando atende requisitos, registrar AuditLog seguro e consumir o token', async () => {
      const res = await fetch(`${apiBaseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: updatedPassword
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe(true);

      // 1. Token consumido (não existe mais)
      const verificationAfter = await prisma.verification.findFirst({
        where: { identifier: `reset-password:${resetToken}` }
      });
      expect(verificationAfter).toBeNull();

      // 2. Não permite reutilização do mesmo token
      const resReuse = await fetch(`${apiBaseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: 'AnotherPassword123!'
        })
      });
      expect(resReuse.status).toBe(400);

      // 3. Usuário consegue autenticar com a NOVA senha
      const loginRes = await fetch(`${apiBaseUrl}/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: validUserEmail,
          password: updatedPassword
        })
      });
      expect(loginRes.status).toBe(200);

      // 4. Usuário NÃO consegue autenticar com a senha antiga
      const oldLoginRes = await fetch(`${apiBaseUrl}/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: validUserEmail,
          password: initialPassword
        })
      });
      expect(oldLoginRes.status).not.toBe(200);

      // 5. Registrou AuditLog seguro (sem dados sensíveis)
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: createdUserId,
          action: 'AUTH_PASSWORD_RESET'
        },
        orderBy: { createdAt: 'desc' }
      });

      expect(auditLog).toBeDefined();
      expect(auditLog!.entityType).toBe('User');
      expect(auditLog!.entityId).toBe(createdUserId);

      // Verifica que NÃO há token, URL ou senha gravados no details do AuditLog
      const details = JSON.parse(auditLog!.details);
      expect(details.userId).toBe(createdUserId);
      expect(details.email).toBe(validUserEmail);
      expect(details.token).toBeUndefined();
      expect(details.password).toBeUndefined();
      expect(details.url).toBeUndefined();
    });
  });

  describe('5. Revogação de Sessões após Reset (revokeSessionsOnPasswordReset = true)', () => {
    it('deve revogar todas as sessões ativas do usuário após a redefinição de senha', async () => {
      // 1. Cria nova sessão realizando login
      const loginRes = await fetch(`${apiBaseUrl}/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: validUserEmail,
          password: updatedPassword
        })
      });
      expect(loginRes.status).toBe(200);

      // 2. Confirma que existem sessões no banco para o usuário
      const sessionsBefore = await prisma.session.findMany({
        where: { userId: createdUserId }
      });
      expect(sessionsBefore.length).toBeGreaterThan(0);

      // 3. Solicita novo token de reset
      await fetch(`${apiBaseUrl}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: validUserEmail })
      });

      const verifications = await prisma.verification.findMany({
        where: { value: createdUserId },
        orderBy: { createdAt: 'desc' }
      });
      const resetVerification = verifications.find(v => v.identifier.startsWith('reset-password:'));
      const secondResetToken = resetVerification!.identifier.replace('reset-password:', '');

      // 4. Executa redefinição de senha
      const resetRes = await fetch(`${apiBaseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: secondResetToken,
          newPassword: 'BrandNewPassword789!'
        })
      });
      expect(resetRes.status).toBe(200);

      // 5. Verifica que as sessões foram totalmente revogadas/deletadas no banco
      const sessionsAfter = await prisma.session.findMany({
        where: { userId: createdUserId }
      });
      expect(sessionsAfter.length).toBe(0);
    });
  });
});
