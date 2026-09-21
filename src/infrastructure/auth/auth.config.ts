import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization } from 'better-auth/plugins';
import { prisma } from '../database/prisma.client.js';

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
    enabled: true
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
