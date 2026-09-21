import { Router } from 'express';
import multer from 'multer';

import { EventsController } from '../controllers/events.controller.js';
import { CampaignsController } from '../controllers/campaigns.controller.js';
import { ConversationsController } from '../controllers/conversations.controller.js';
import { PersonsController } from '../controllers/persons.controller.js';
import { WebhooksController } from '../controllers/webhooks.controller.js';
import { MetricsController } from '../controllers/metrics.controller.js';
import { SandboxController } from '../controllers/sandbox.controller.js';
import { TasksController } from '../controllers/tasks.controller.js';
import { OrganizationController } from '../controllers/organization.controller.js';
import { GpnWebhooksController } from '../controllers/gpn-webhooks.controller.js';

import { requireAuth, requireOrganization, requireRole } from '../middlewares/auth.middleware.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from '../../infrastructure/whatsapp/mock-whatsapp.provider.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';

// Configuração do multer em memória para upload de planilhas
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

export function createApiRouter(
  whatsappProvider: IWhatsAppProvider,
  aiService: IAIService
): Router {
  const router = Router();

  const eventsController = new EventsController();
  const campaignsController = new CampaignsController(whatsappProvider);
  const conversationsController = new ConversationsController(whatsappProvider);
  const personsController = new PersonsController();
  const webhooksController = new WebhooksController(whatsappProvider, aiService);
  const metricsController = new MetricsController();
  const mockProvider = MockWhatsAppProvider.getInstance();
  const sandboxController = new SandboxController(mockProvider, aiService);
  const organizationController = new OrganizationController();
  const tasksController = new TasksController();

  // --- Configuração Pública / Branding Inicial (Não Autenticada) ---
  router.get('/public-config', (_req, res) => {
    const vertical = process.env.VERTICAL_PROFILE || 'DEFAULT';
    const isAccounting = vertical === 'ACCOUNTING';
    const allowPublicSignup = process.env.ALLOW_PUBLIC_SIGNUP !== 'false';
    res.json({
      verticalProfile: vertical,
      allowPublicSignup,
      brandName: process.env.BRAND_NAME || (isAccounting ? 'YESHUA AI CLIENT DESK' : 'Conecta CRM'),
      brandSubtitle: process.env.BRAND_SUBTITLE || (isAccounting ? 'powered by MEGA CORE' : 'SaaS Multi-Tenant & IA'),
      demoUserEmail: isAccounting ? (process.env.YESHUA_DEMO_EMAIL || 'demo@yeshuacontabilidade.com.br') : undefined
    });
  });

  // --- Rotas de Gerenciamento de Workspaces/Organizações (Autenticadas) ---
  router.get('/organizations/my', requireAuth, (req, res) => organizationController.listMyOrganizations(req, res));
  router.post('/organizations', requireAuth, (req, res) => organizationController.createOrganization(req, res));

  // --- Rotas de Configurações da Organização Ativa (Tenant-Isolated + RBAC) ---
  router.get('/organization/settings', requireAuth, requireOrganization, (req, res) =>
    organizationController.getSettings(req, res)
  );
  router.patch('/organization/settings', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN']), (req, res) =>
    organizationController.updateSettings(req, res)
  );
  router.patch('/organization/whatsapp', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN']), (req, res) =>
    organizationController.updateWhatsAppConnection(req, res)
  );

  // --- Rotas de Eventos e Presença (Tenant-Isolated) ---
  router.get('/events', requireAuth, requireOrganization, (req, res) => eventsController.list(req, res));
  router.post('/events', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    eventsController.create(req, res)
  );
  router.get('/events/:id', requireAuth, requireOrganization, (req, res) => eventsController.getById(req, res));
  router.post('/events/:id/import', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), upload.single('file'), (req, res) =>
    eventsController.importSpreadsheet(req, res)
  );
  router.post('/events/:id/attendances', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    eventsController.registerAttendance(req, res)
  );

  // --- Rotas de Campanhas de Disparo (Tenant-Isolated) ---
  router.get('/campaigns', requireAuth, requireOrganization, (req, res) => campaignsController.list(req, res));
  router.post('/campaigns', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    campaignsController.dispatch(req, res)
  );
  router.get('/campaigns/:id', requireAuth, requireOrganization, (req, res) => campaignsController.getById(req, res));

  // --- Rotas de Conversas e Triagem (Tenant-Isolated) ---
  router.get('/conversations', requireAuth, requireOrganization, (req, res) => conversationsController.list(req, res));
  router.get('/conversations/:id', requireAuth, requireOrganization, (req, res) => conversationsController.getById(req, res));
  router.post('/conversations/:id/reply', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    conversationsController.reply(req, res)
  );

  // --- Rotas de Pessoas (CRM) e Linha do Tempo (Tenant-Isolated) ---
  router.get('/persons', requireAuth, requireOrganization, (req, res) => personsController.list(req, res));
  router.post('/persons', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    personsController.create(req, res)
  );
  router.get('/persons/:id', requireAuth, requireOrganization, (req, res) => personsController.getById(req, res));
  router.get('/persons/:id/timeline', requireAuth, requireOrganization, (req, res) => personsController.getTimeline(req, res));
  router.put('/persons/:id', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    personsController.update(req, res)
  );

  // --- Rotas de Tarefas e Acompanhamento Pastoral (Tenant-Isolated) ---
  router.get('/tasks', requireAuth, requireOrganization, (req, res) => tasksController.list(req, res));
  router.patch('/tasks/:id', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    tasksController.updateStatus(req, res)
  );

  // --- Métricas do Dashboard (Tenant-Isolated) ---
  router.get('/metrics', requireAuth, requireOrganization, (req, res) =>
    metricsController.getDashboardMetrics(req, res)
  );
  router.get('/metrics/dashboard', requireAuth, requireOrganization, (req, res) =>
    metricsController.getDashboardMetrics(req, res)
  );

  // --- Webhooks Oficiais do WhatsApp (Públicos + Multi-Tenant via HMAC) ---
  router.get('/webhooks/whatsapp', (req, res) => webhooksController.verify(req, res));
  router.post('/webhooks/whatsapp', (req, res) => webhooksController.handle(req, res));

  // --- Webhooks do GPN Core Gateway (Público + Multi-Tenant via HMAC GPN) ---
  const gpnWebhooksController = new GpnWebhooksController(aiService);
  router.post('/webhooks/gpn', (req, res) => gpnWebhooksController.handle(req, res));

  // --- Rotas do Simulador Sandbox (Protegidas por Auth, Tenant e RBAC) ---
  router.get('/sandbox/events', requireAuth, requireOrganization, (req, res) => sandboxController.streamEvents(req, res));
  router.get('/sandbox/history', requireAuth, requireOrganization, (req, res) => sandboxController.getHistory(req, res));
  router.post('/sandbox/simulate-reply', requireAuth, requireOrganization, requireRole(['OWNER', 'ADMIN', 'OPERATOR']), (req, res) =>
    sandboxController.simulateReply(req, res)
  );

  return router;
}
