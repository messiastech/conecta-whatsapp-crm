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
   * Streaming Server-Sent Events (SSE) em tempo real isolado por tenant
   */
  streamEvents(req: Request, res: Response): void {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: 'ORGANIZATION_REQUIRED', message: 'Workspace não selecionado' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const listener = (eventData: any) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    const emitter = this.mockProvider.getEventsEmitter();
    const eventChannel = `sandbox_event:${organizationId}`;
    emitter.on(eventChannel, listener);

    // Envia heartbeat para manter a conexão aberta
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      emitter.off(eventChannel, listener);
      clearInterval(heartbeat);
    });
  }

  getHistory(req: Request, res: Response): void {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: 'ORGANIZATION_REQUIRED', message: 'Workspace não selecionado' });
      return;
    }
    res.json(this.mockProvider.getHistory(organizationId));
  }

  /**
   * Simula o envio de uma resposta pelo WhatsApp isolada por tenant (sem fallback)
   */
  async simulateReply(req: Request, res: Response): Promise<void> {
    try {
      const { fromPhone, text } = req.body;

      if (!fromPhone || !text) {
        res.status(400).json({ error: 'fromPhone e text são obrigatórios' });
        return;
      }

      const organizationId = req.organizationId;
      if (!organizationId) {
        res.status(400).json({
          error: 'ORGANIZATION_REQUIRED',
          message: 'Nenhum workspace selecionado. Operação negada.'
        });
        return;
      }

      // 1. Injeta a mensagem no Mock Provider para emitir evento SSE apenas para o canal do tenant
      const mockMsg = this.mockProvider.simulateIncomingReply(fromPhone, text, organizationId);

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
