import { Request, Response } from 'express';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { ProcessInboundMessageUseCase } from '../../application/use-cases/process-inbound-message.use-case.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export class WebhooksController {
  private inboundUseCase: ProcessInboundMessageUseCase;

  constructor(
    private whatsappProvider: IWhatsAppProvider,
    private aiService: IAIService
  ) {
    this.inboundUseCase = new ProcessInboundMessageUseCase(this.aiService);
  }

  /**
   * Handshake de verificação do Webhook da Meta (GET)
   */
  verify(req: Request, res: Response): void {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    const result = this.whatsappProvider.verifyWebhook(mode, token, challenge);
    if (result !== null) {
      res.status(200).send(result);
    } else {
      res.status(403).send('Forbidden: Token mismatch');
    }
  }

  /**
   * Recepção de eventos do Webhook (POST)
   */
  async handle(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const signature = req.headers['x-hub-signature-256'] as string | undefined;

      // Validação de assinatura
      const isValid = this.whatsappProvider.validateSignature(rawBody, signature);
      if (!isValid) {
        res.status(403).json({ error: 'Assinatura HMAC-SHA256 inválida' });
        return;
      }

      // Responde imediatamente 200 OK para a Meta
      res.status(200).send('EVENT_RECEIVED');

      const parsed = this.whatsappProvider.parseWebhookPayload(req.body);

      // Processa mensagens recebidas de forma assíncrona
      for (const msg of parsed.messages) {
        try {
          await this.inboundUseCase.execute({
            fromPhone: msg.fromPhone,
            text: msg.text,
            providerMessageId: msg.messageId,
            rawPayload: msg.rawPayload
          });
        } catch (err: any) {
          console.error(`[Webhook] Erro ao processar mensagem inbound (${msg.messageId}):`, err.message);
        }
      }

      // Processa atualizações de status de entrega/leitura
      for (const st of parsed.statuses) {
        try {
          const dbStatus = st.status.toUpperCase();
          const updateData: any = { status: dbStatus };
          if (st.status === 'delivered') updateData.deliveredAt = st.timestamp;
          if (st.status === 'read') updateData.readAt = st.timestamp;
          if (st.errorMessage) updateData.errorMessage = st.errorMessage;

          await prisma.message.updateMany({
            where: { providerMessageId: st.messageId },
            data: updateData
          });
        } catch (err: any) {
          console.error(`[Webhook] Erro ao atualizar status (${st.messageId}):`, err.message);
        }
      }
    } catch (err: any) {
      console.error('[Webhook] Erro geral no processamento:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  }
}
