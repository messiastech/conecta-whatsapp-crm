import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';
import { prisma } from '../database/prisma.client.js';
import { ResendEmailService } from '../email/resend-email.service.js';

const envOrigins = [
  ...(process.env.CORS_ORIGIN || '').split(','),
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(',')
]
  .map(o => o.trim())
  .filter(Boolean);

if (process.env.BETTER_AUTH_URL && !envOrigins.includes(process.env.BETTER_AUTH_URL)) {
  envOrigins.push(process.env.BETTER_AUTH_URL);
}

const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const trustedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins,
  database: prismaAdapter(prisma, {
    provider: 'postgresql'
  }),
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url, token }) => {
      // P0: Anti-enumeração por timing — NÃO aguardar o envio Resend (disparo assíncrono não-bloqueante)
      // Sem await da chamada externa, sem unhandled rejection e sem vazar tokens/URLs/API keys em logs
      void ResendEmailService.sendPasswordResetEmail({
        to: user.email,
        userName: user.name,
        token,
        url
      }).catch(() => {
        console.error('[auth] Falha assíncrona ao processar envio de e-mail de recuperação');
      });
    },
    onPasswordReset: async ({ user }) => {
      try {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'AUTH_PASSWORD_RESET',
            entityType: 'User',
            entityId: user.id,
            details: JSON.stringify({
              userId: user.id,
              email: user.email,
              timestamp: new Date().toISOString()
            })
          }
        });
      } catch (err) {
        console.error('[auth] Falha ao registrar AuditLog de recuperação de senha:', err);
      }
    }
  },
  rateLimit: {
    enabled: process.env.ENABLE_RATE_LIMIT === 'true' ? true : undefined,
    customRules: {
      '/request-password-reset': {
        window: 60,
        max: 3
      },
      '/reset-password': {
        window: 60,
        max: 5
      }
    }
  },
  advanced: {
    disableOriginCheck: false,
    disableCSRFCheck: process.env.NODE_ENV === 'test'
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60 // 5 minutos de cache em cookie
    }
  },
  plugins: [
    organization({
      creatorRole: 'owner'
    })
  ]
});
