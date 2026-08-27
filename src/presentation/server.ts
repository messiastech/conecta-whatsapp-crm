import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { createApiRouter } from './routes/api.routes.js';
import { IWhatsAppProvider } from '../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from '../infrastructure/whatsapp/mock-whatsapp.provider.js';
import { MetaWhatsAppProvider } from '../infrastructure/whatsapp/meta-whatsapp.provider.js';
import { CompositeAIService } from '../infrastructure/ai/composite-ai.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildApp(): { app: express.Express; whatsappProvider: IWhatsAppProvider } {
  const app = express();

  // Configuração de CORS aberta para o painel em desenvolvimento
  app.use(cors({ origin: '*' }));

  // Middleware para capturar o rawBody buffer necessário para validação HMAC-SHA256
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Escolha do Provedor de WhatsApp via variável de ambiente
  const providerType = process.env.WHATSAPP_PROVIDER || 'mock';
  let whatsappProvider: IWhatsAppProvider;

  if (providerType === 'meta') {
    whatsappProvider = new MetaWhatsAppProvider({
      apiUrl: process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v21.0',
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
      accessToken: process.env.META_ACCESS_TOKEN || '',
      appSecret: process.env.META_APP_SECRET || '',
      webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'conecta_webhook_token_secret_2026'
    });
    console.log('[WhatsApp CRM] Provedor Oficial WhatsApp Cloud API ativado');
  } else {
    whatsappProvider = MockWhatsAppProvider.getInstance();
    console.log('[WhatsApp CRM] Provedor Mock Sandbox ativado (Modo de Desenvolvimento & Demonstração)');
  }

  // Inicializa o Serviço de IA em cascata (Gemini -> Fallback Heurístico Local)
  const aiService = new CompositeAIService();

  // Registra as rotas da API REST
  app.use('/api', createApiRouter(whatsappProvider, aiService));

  // Rota de Health Check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
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
    // Fallback amigável enquanto o frontend estiver rodando via Vite dev server
    app.get('/', (_req: Request, res: Response) => {
      res.send(`
        <html>
          <head><title>Conecta WhatsApp CRM - API</title></head>
          <body style="font-family: sans-serif; padding: 40px; line-height: 1.6; max-width: 700px; margin: 0 auto;">
            <h2>🚀 Conecta WhatsApp CRM - Servidor Ativo</h2>
            <p>A API REST e o motor de Webhook estão operando com sucesso.</p>
            <ul>
              <li><strong>Health Check:</strong> <a href="/health">/health</a></li>
              <li><strong>Dashboard Metrics:</strong> <a href="/api/metrics/dashboard">/api/metrics/dashboard</a></li>
              <li><strong>Eventos:</strong> <a href="/api/events">/api/events</a></li>
              <li><strong>Pessoas:</strong> <a href="/api/persons">/api/persons</a></li>
              <li><strong>Conversas:</strong> <a href="/api/conversations">/api/conversations</a></li>
              <li><strong>Sandbox History:</strong> <a href="/api/sandbox/history">/api/sandbox/history</a></li>
            </ul>
            <p>Para abrir a interface visual completa do painel administrativo, acesse o cliente web em <code>http://localhost:3000</code> ou inicie com <code>npm run dev</code>.</p>
          </body>
        </html>
      `);
    });
  }

  return { app, whatsappProvider };
}

// Inicialização direta do servidor se executado como script principal
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  const { app } = buildApp();
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  🌟 CONECTA WHATSAPP CRM - SERVIDOR INICIADO`);
    console.log(`  🔗 URL: http://localhost:${PORT}`);
    console.log(`  📡 Webhook Endpoint: http://localhost:${PORT}/api/webhooks/whatsapp`);
    console.log(`  📱 Sandbox Stream: http://localhost:${PORT}/api/sandbox/events`);
    console.log(`======================================================\n`);
  });
}
