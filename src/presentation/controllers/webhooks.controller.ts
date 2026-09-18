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

    // 1. Verifica token global do .env
    const globalToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'conecta_webhook_token_secret_2026';
    if (token === globalToken) {
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

      // 1. Localiza a organização através do phoneNumberId presente nos metadados do payload
      const phoneNumberId =
        req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

      let targetOrgId: string | null = null;
      let appSecret: string | null = process.env.META_APP_SECRET || null;

      if (phoneNumberId) {
        const connection = await prisma.whatsAppConnection.findFirst({
          where: { phoneNumberId }
        });
        if (connection) {
          targetOrgId = connection.organizationId;
          if (connection.encryptedAppSecret) {
            appSecret = CryptoService.decrypt(connection.encryptedAppSecret);
          }
        }
      }

      // Se não identificou por phoneNumberId, busca a organização padrão (ex: primeiro workspace ativo)
      if (!targetOrgId) {
        const defaultOrg = await prisma.organization.findFirst({
          orderBy: { createdAt: 'asc' }
        });
        targetOrgId = defaultOrg?.id || null;
      }

      // Validação de assinatura HMAC SHA-256 se appSecret estiver configurado
      if (appSecret && signature && signature.startsWith('sha256=')) {
        const expectedHash = crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex');

        const sigBuf = Buffer.from(signature.substring(7), 'utf8');
        const expBuf = Buffer.from(expectedHash, 'utf8');

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          res.status(403).json({ error: 'Assinatura HMAC-SHA256 inválida' });
          return;
        }
      }

      // Responde imediatamente 200 OK para a Meta
      res.status(200).send('EVENT_RECEIVED');

      if (!targetOrgId) {
        console.warn('[Webhook] Nenhum workspace cadastrado para processar mensagem.');
        return;
      }

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
