import { Request, Response } from 'express';
import { MockWhatsAppProvider } from '../../infrastructure/whatsapp/mock-whatsapp.provider.js';
import { ProcessInboundMessageUseCase } from '../../application/use-cases/process-inbound-message.use-case.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export class SandboxController {
  private inboundUseCase: ProcessInboundMessageUseCase;

  constructor(
    private mockProvider: MockWhatsAppProvider,
    private aiService: IAIService
  ) {
    this.inboundUseCase = new ProcessInboundMessageUseCase(this.aiService);
  }

  /**
   * Streaming Server-Sent Events (SSE) em tempo real para o simulador visual do dashboard
   */
  streamEvents(_req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const listener = (eventData: any) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    const emitter = this.mockProvider.getEventsEmitter();
    emitter.on('sandbox_event', listener);

    // Envia heartbeat para manter a conexão aberta
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    _req.on('close', () => {
      emitter.off('sandbox_event', listener);
      clearInterval(heartbeat);
    });
  }

  getHistory(_req: Request, res: Response): void {
    res.json(this.mockProvider.getHistory());
  }

  /**
   * Simula o envio de uma resposta pelo WhatsApp isolada por tenant
   */
  async simulateReply(req: Request, res: Response): Promise<void> {
    try {
      const { fromPhone, text } = req.body;

      if (!fromPhone || !text) {
        res.status(400).json({ error: 'fromPhone e text são obrigatórios' });
        return;
      }

      // Usa a organização ativa do contexto ou busca a primeira cadastrada
      let organizationId = req.organizationId;
      if (!organizationId) {
        const firstOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
        organizationId = firstOrg?.id;
      }

      if (!organizationId) {
        res.status(400).json({ error: 'Nenhum workspace disponível para simular envio' });
        return;
      }

      // 1. Injeta a mensagem no Mock Provider para emitir evento SSE
      const mockMsg = this.mockProvider.simulateIncomingReply(fromPhone, text);

      // 2. Processa a mensagem pelo caso de uso isolado do tenant
      const result = await this.inboundUseCase.execute({
        organizationId,
        fromPhone,
        text,
        providerMessageId: mockMsg.messageId,
        rawPayload: mockMsg.rawPayload
      });

      res.status(200).json({
        success: true,
        mockMessage: mockMsg,
        processedResult: result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
