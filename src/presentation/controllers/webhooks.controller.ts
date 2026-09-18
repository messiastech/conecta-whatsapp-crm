import { Request, Response } from 'express';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { ProcessInboundMessageUseCase } from '../../application/use-cases/process-inbound-message.use-case.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { CryptoService } from '../../infrastructure/security/crypto.service.js';
import crypto from 'crypto';

export class WebhooksController {
  private inboundUseCase: ProcessInboundMessageUseCase;

  constructor(
    private defaultWhatsAppProvider: IWhatsAppProvider,
    private aiService: IAIService
  ) {
    this.inboundUseCase = new ProcessInboundMessageUseCase(this.aiService);
  }

  /**
   * Handshake de verificação do Webhook da Meta (GET) - Público
   */
  async verify(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    if (mode !== 'subscribe') {
      res.status(403).send('Forbidden: Mode invalid');
      return;
    }

    // 1. Verifica token global do .env se explicitamente configurado (sem fallback hardcoded)
    const globalToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (globalToken && token === globalToken) {
      res.status(200).send(challenge || '');
      return;
    }

    // 2. Ou verifica se pertence ao token de alguma organização específica
    const matchedConnection = await prisma.whatsAppConnection.findFirst({
      where: { webhookVerifyToken: token }
    });

    if (matchedConnection) {
      res.status(200).send(challenge || '');
      return;
    }

    res.status(403).send('Forbidden: Token mismatch');
  }

  /**
   * Recepção de eventos do Webhook da Meta (POST) - Público e Multi-Tenant
   */
  async handle(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const signature = req.headers['x-hub-signature-256'] as string | undefined;

      // 1. Localiza a organização EXCLUSIVAMENTE pelo phoneNumberId presente nos metadados
      const phoneNumberId =
        req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

      if (!phoneNumberId) {
        console.warn('[Webhook] Evento descartado: phone_number_id ausente no payload.');
        res.status(400).json({
          error: 'PHONE_NUMBER_ID_REQUIRED',
          message: 'phone_number_id ausente nos metadados do payload'
        });
        return;
      }

      const connection = await prisma.whatsAppConnection.findFirst({
        where: { phoneNumberId }
      });

      if (!connection) {
        console.warn(`[Webhook] Evento descartado: phone_number_id desconhecido (${phoneNumberId}).`);
        res.status(404).json({
          error: 'UNKNOWN_PHONE_NUMBER_ID',
          message: 'Nenhum tenant associado a este phoneNumberId'
        });
        return;
      }

      const targetOrgId = connection.organizationId;

      // 2. Validação de segurança HMAC-SHA256: Conexão Meta real EXIGE assinatura válida
      if (!connection.isMock) {
        if (!signature || !signature.startsWith('sha256=')) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Assinatura X-Hub-Signature-256 obrigatória para conexão Meta real'
          });
          return;
        }

        const appSecret = connection.encryptedAppSecret
          ? CryptoService.decrypt(connection.encryptedAppSecret)
          : null;

        if (!appSecret) {
          res.status(500).json({
            error: 'CONFIG_ERROR',
            message: 'App Secret não configurado para o tenant'
          });
          return;
        }

        const expectedHash = crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex');

        const sigBuf = Buffer.from(signature.substring(7), 'utf8');
        const expBuf = Buffer.from(expectedHash, 'utf8');

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          res.status(403).json({ error: 'FORBIDDEN', message: 'Assinatura HMAC-SHA256 inválida' });
          return;
        }
      } else if (signature && signature.startsWith('sha256=')) {
        // Para mock com assinatura enviada, valida se secret estiver configurado
        const appSecret = connection.encryptedAppSecret
          ? CryptoService.decrypt(connection.encryptedAppSecret)
          : process.env.META_APP_SECRET;

        if (appSecret) {
          const expectedHash = crypto
            .createHmac('sha256', appSecret)
            .update(rawBody)
            .digest('hex');

          const sigBuf = Buffer.from(signature.substring(7), 'utf8');
          const expBuf = Buffer.from(expectedHash, 'utf8');

          if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            res.status(403).json({ error: 'FORBIDDEN', message: 'Assinatura HMAC-SHA256 inválida' });
            return;
          }
        }
      }

      // Responde imediatamente 200 OK para a Meta
      res.status(200).send('EVENT_RECEIVED');

      const parsed = this.defaultWhatsAppProvider.parseWebhookPayload(req.body);

      // Processa mensagens recebidas isoladas pelo tenant identificado
      for (const msg of parsed.messages) {
        try {
          await this.inboundUseCase.execute({
            organizationId: targetOrgId,
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
