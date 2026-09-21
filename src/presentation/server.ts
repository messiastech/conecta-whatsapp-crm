import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { toNodeHandler } from 'better-auth/node';

import { createApiRouter } from './routes/api.routes.js';
import { IWhatsAppProvider } from '../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from '../infrastructure/whatsapp/mock-whatsapp.provider.js';
import { MetaWhatsAppProvider } from '../infrastructure/whatsapp/meta-whatsapp.provider.js';
import { CompositeAIService } from '../infrastructure/ai/composite-ai.service.js';
import { auth } from '../infrastructure/auth/auth.config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function validateProductionEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    const missing: string[] = [];

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))) {
      missing.push('DATABASE_URL (deve ser uma URL válida de conexão PostgreSQL)');
    }

    const authSecret = process.env.BETTER_AUTH_SECRET;
    if (!authSecret || authSecret.length < 32) {
      missing.push('BETTER_AUTH_SECRET (obrigatório, mínimo 32 caracteres em produção)');
    }

    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey || masterKey.length < 32) {
      missing.push('ENCRYPTION_MASTER_KEY (obrigatório, mínimo 32 caracteres para AES-256-GCM)');
    }

    if (process.env.WHATSAPP_PROVIDER === 'meta' && !process.env.META_WEBHOOK_VERIFY_TOKEN) {
      missing.push('META_WEBHOOK_VERIFY_TOKEN (obrigatório em produção quando WHATSAPP_PROVIDER=meta)');
    }

    if (missing.length > 0) {
      const errorMsg = `[FATAL] Startup abortado em ambiente de PRODUÇÃO. Segredos obrigatórios ausentes ou inválidos:\n${missing.map(m => ` - ${m}`).join('\n')}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }
}

export function buildApp(): { app: express.Express; whatsappProvider: IWhatsAppProvider } {
  validateProductionEnvironment();
  const app = express();

  // Configuração rigorosa de CORS e Segurança para SaaS
  const rawOrigins = process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173';
  const allowedOrigins = rawOrigins.split(',').map(s => s.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Permite requisições sem origin (como mobile apps, curl, webhooks da Meta)
        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          allowedOrigins.includes('*') ||
          (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
        ) {
          callback(null, true);
        } else {
          callback(new Error(`Origem [${origin}] não permitida pela política de CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id', 'x-hub-signature-256']
    })
  );

  // Headers de proteção HTTP básica
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Middleware para capturar o rawBody buffer necessário para validação HMAC-SHA256 da Meta
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Rotas de Autenticação do Better Auth (/api/auth/*)
  app.all('/api/auth/*', toNodeHandler(auth));

  // Escolha do Provedor Padrão de WhatsApp (Mock ou Meta)
  const providerType = process.env.WHATSAPP_PROVIDER || 'mock';
  let whatsappProvider: IWhatsAppProvider;

  if (providerType === 'meta') {
    whatsappProvider = new MetaWhatsAppProvider({
      apiUrl: process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v21.0',
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
      accessToken: process.env.META_ACCESS_TOKEN || '',
      appSecret: process.env.META_APP_SECRET || '',
      webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || ''
    });
    console.log('[WhatsApp CRM] Provedor Oficial WhatsApp Cloud API ativado como fallback global');
  } else {
    whatsappProvider = MockWhatsAppProvider.getInstance();
    console.log('[WhatsApp CRM] Provedor Mock Sandbox ativado');
  }

  // Inicializa o Serviço de IA em cascata
  const aiService = new CompositeAIService();

  // Registra as rotas da API REST
  app.use('/api', createApiRouter(whatsappProvider, aiService));

  // Rota de Health Check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      auth: 'Better Auth (Active)',
      multiTenancy: 'Enabled (PostgreSQL)',
      provider: providerType,
      ai: process.env.GEMINI_API_KEY ? 'Gemini (Cloud)' : 'Rule-Based Fallback (Local)'
    });
  });

  // Servir frontend compilado estático se existir
  const clientDistPath = fs.existsSync(path.resolve(process.cwd(), 'src/client/dist'))
    ? path.resolve(process.cwd(), 'src/client/dist')
    : path.resolve(__dirname, '../client/dist');

  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res.send(`
        <html>
          <head><title>Conecta WhatsApp CRM - API SaaS</title></head>
          <body style="font-family: sans-serif; padding: 40px; line-height: 1.6; max-width: 700px; margin: 0 auto;">
            <h2>🚀 Conecta WhatsApp CRM - SaaS Ativo</h2>
            <p>A API REST, Autenticação e Multi-Tenancy estão operando com sucesso.</p>
            <ul>
              <li><strong>Health Check:</strong> <a href="/health">/health</a></li>
              <li><strong>Auth API:</strong> <code>/api/auth</code></li>
              <li><strong>Dashboard Metrics:</strong> <code>/api/metrics/dashboard</code></li>
            </ul>
          </body>
        </html>
      `);
    });
  }

  return { app, whatsappProvider };
}

// Inicialização direta do servidor se executado como script principal
const isMainModule = Boolean(
  process.argv[1] && (
    path.resolve(process.argv[1]) === path.resolve(__filename) ||
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js')
  )
);

if (isMainModule && process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  const { app } = buildApp();
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  🌟 CONECTA WHATSAPP CRM - SAAS MULTI-TENANT INICIADO`);
    console.log(`  🔗 URL: http://localhost:${PORT}`);
    console.log(`  📡 Webhook Endpoint: http://localhost:${PORT}/api/webhooks/whatsapp`);
    console.log(`  🔐 Auth Endpoint: http://localhost:${PORT}/api/auth`);
    console.log(`======================================================\n`);
  });
}
