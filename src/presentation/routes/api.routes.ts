import { Router } from 'express';
import multer from 'multer';
import { EventsController } from '../controllers/events.controller.js';
import { CampaignsController } from '../controllers/campaigns.controller.js';
import { ConversationsController } from '../controllers/conversations.controller.js';
import { PersonsController } from '../controllers/persons.controller.js';
import { WebhooksController } from '../controllers/webhooks.controller.js';
import { MetricsController } from '../controllers/metrics.controller.js';
import { SandboxController } from '../controllers/sandbox.controller.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from '../../infrastructure/whatsapp/mock-whatsapp.provider.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';

const upload = multer({ storage: multer.memoryStorage() });

export function createApiRouter(
  whatsappProvider: IWhatsAppProvider,
  aiService: IAIService
): Router {
  const router = Router();

  const eventsCtrl = new EventsController();
  const campaignsCtrl = new CampaignsController(whatsappProvider);
  const conversationsCtrl = new ConversationsController(whatsappProvider);
  const personsCtrl = new PersonsController();
  const webhooksCtrl = new WebhooksController(whatsappProvider, aiService);
  const metricsCtrl = new MetricsController();
  const sandboxCtrl = new SandboxController(MockWhatsAppProvider.getInstance(), aiService);

  // 1. Métricas & Dashboard
  router.get('/metrics/dashboard', (req, res) => metricsCtrl.getDashboardMetrics(req, res));

  // 2. Eventos & Importação
  router.get('/events', (req, res) => eventsCtrl.list(req, res));
  router.post('/events', (req, res) => eventsCtrl.create(req, res));
  router.get('/events/:id', (req, res) => eventsCtrl.getById(req, res));
  router.post('/events/:id/import', upload.single('file'), (req, res) => eventsCtrl.importSpreadsheet(req, res));

  // 3. Pessoas / CRM
  router.get('/persons', (req, res) => personsCtrl.list(req, res));
  router.get('/persons/:id', (req, res) => personsCtrl.getById(req, res));
  router.patch('/persons/:id', (req, res) => personsCtrl.update(req, res));

  // 4. Campanhas & Disparos
  router.get('/campaigns', (req, res) => campaignsCtrl.list(req, res));
  router.post('/campaigns/dispatch', (req, res) => campaignsCtrl.dispatch(req, res));
  router.get('/campaigns/:id', (req, res) => campaignsCtrl.getById(req, res));

  // 5. Conversas & Supervisão Humana
  router.get('/conversations', (req, res) => conversationsCtrl.list(req, res));
  router.get('/conversations/:id', (req, res) => conversationsCtrl.getById(req, res));
  router.post('/conversations/:id/reply', (req, res) => conversationsCtrl.reply(req, res));

  // 6. Webhooks Oficiais da Meta
  router.get('/webhooks/whatsapp', (req, res) => webhooksCtrl.verify(req, res));
  router.post('/webhooks/whatsapp', (req, res) => webhooksCtrl.handle(req, res));

  // 7. Sandbox & Simulador Interativo de Smartphone
  router.get('/sandbox/events', (req, res) => sandboxCtrl.streamEvents(req, res));
  router.get('/sandbox/history', (req, res) => sandboxCtrl.getHistory(req, res));
  router.post('/sandbox/simulate-reply', (req, res) => sandboxCtrl.simulateReply(req, res));
  router.post('/sandbox/toggle-fail', (req, res) => sandboxCtrl.toggleFail(req, res));

  return router;
}
