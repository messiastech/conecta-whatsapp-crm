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
  const tasksController = new TasksController();

  // --- Rotas de Eventos e Presença ---
  router.get('/events', (req, res) => eventsController.list(req, res));
  router.post('/events', (req, res) => eventsController.create(req, res));
  router.get('/events/:id', (req, res) => eventsController.getById(req, res));
  router.post('/events/:id/import', upload.single('file'), (req, res) =>
    eventsController.importSpreadsheet(req, res)
  );

  // --- Rotas de Campanhas de Disparo ---
  router.get('/campaigns', (req, res) => campaignsController.list(req, res));
  router.post('/campaigns', (req, res) => campaignsController.dispatch(req, res));
  router.get('/campaigns/:id', (req, res) => campaignsController.getById(req, res));

  // --- Rotas de Conversas e Triagem ---
  router.get('/conversations', (req, res) => conversationsController.list(req, res));
  router.get('/conversations/:id', (req, res) => conversationsController.getById(req, res));
  router.post('/conversations/:id/reply', (req, res) => conversationsController.reply(req, res));

  // --- Rotas de Pessoas (CRM) e Linha do Tempo ---
  router.get('/persons', (req, res) => personsController.list(req, res));
  router.get('/persons/:id', (req, res) => personsController.getById(req, res));
  router.get('/persons/:id/timeline', (req, res) => personsController.getTimeline(req, res));
  router.put('/persons/:id', (req, res) => personsController.update(req, res));

  // --- Rotas de Tarefas e Acompanhamento Pastoral (Follow-Up) ---
  router.get('/tasks', (req, res) => tasksController.list(req, res));
  router.patch('/tasks/:id', (req, res) => tasksController.updateStatus(req, res));

  // --- Métricas do Dashboard ---
  router.get('/metrics/dashboard', (req, res) => metricsController.getDashboardMetrics(req, res));

  // --- Webhooks Oficiais do WhatsApp (Meta Graph API) ---
  router.get('/webhooks/whatsapp', (req, res) => webhooksController.verify(req, res));
  router.post('/webhooks/whatsapp', (req, res) => webhooksController.handle(req, res));

  // --- Rotas do Simulador Sandbox ---
  router.get('/sandbox/events', (req, res) => sandboxController.streamEvents(req, res));
  router.get('/sandbox/history', (req, res) => sandboxController.getHistory(req, res));
  router.post('/sandbox/simulate-reply', (req, res) => sandboxController.simulateReply(req, res));

  return router;
}
