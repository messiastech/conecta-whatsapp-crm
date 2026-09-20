import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { CryptoService } from '../../infrastructure/security/crypto.service.js';
import { GPNWhatsAppProvider } from '../../infrastructure/whatsapp/gpn-whatsapp.provider.js';
import { ProcessInboundMessageUseCase } from '../../application/use-cases/process-inbound-message.use-case.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';

/**
 * Controller dedicado para recepção de webhooks do GPN Core Gateway.
 *
 * Eventos suportados nesta fase:
 * - message.inbound: Mensagem recebida de um contato WhatsApp
 * - message.ack: ACK de entrega/leitura de mensagem enviada
 * - session.status: Mudança de status da sessão Baileys (connected/disconnected/qr/etc)
 *
 * Segurança:
 * - Validação HMAC-SHA256 obrigatória (x-gpn-signature)
 * - Proteção anti-replay via timestamp (tolerância 5 minutos)
 * - Idempotência via @@unique([organizationId, eventId]) no banco
 * - Isolamento multi-tenant: cada organização valida seu próprio webhookSecret
 */
export class GpnWebhooksController {
  private inboundUseCase: ProcessInboundMessageUseCase;

  constructor(aiService: IAIService) {
    this.inboundUseCase = new ProcessInboundMessageUseCase(aiService);
  }

  /**
   * POST /api/webhooks/gpn
   * Recebe eventos do GPN Core Gateway e roteia por tipo de evento.
   */
  async handle(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = (req as any).rawBody
        ? (req as any).rawBody.toString('utf8')
        : JSON.stringify(req.body);

      // Extrair headers de identificação do GPN
      const signature = req.headers['x-gpn-signature'] as string | undefined;
      const eventId = req.headers['x-gpn-event-id'] as string | undefined;
      const timestamp = req.headers['x-gpn-timestamp'] as string | undefined;
      const eventType = req.headers['x-gpn-event'] as string | undefined;

      if (!eventId || !timestamp || !eventType) {
        res.status(400).json({
          error: 'GPN_HEADERS_REQUIRED',
          message: 'Headers x-gpn-event-id, x-gpn-timestamp e x-gpn-event obrigatórios.'
        });
        return;
      }

      // Extrair tenantId do body para identificar a organização
      const body = req.body;
      const tenantId = body?.tenantId;

      if (!tenantId) {
        res.status(400).json({
          error: 'TENANT_ID_REQUIRED',
          message: 'tenantId ausente no payload do webhook GPN.'
        });
        return;
      }

      // Localizar a organização pelo tenantId do GPN
      // O tenantId do GPN é mapeado ao organizationId ou slug da organização no Conecta
      const gpnConnection = await prisma.gpnConnection.findFirst({
        where: {
          organization: {
            OR: [
              { id: tenantId },
              { slug: tenantId }
            ]
          },
          isActive: true
        },
        include: { organization: true }
      });

      if (!gpnConnection) {
        res.status(404).json({
          error: 'GPN_TENANT_NOT_FOUND',
          message: `Nenhuma organização ativa com GPN configurado para tenantId "${tenantId}".`
        });
        return;
      }

      const organizationId = gpnConnection.organizationId;

      // Validação HMAC-SHA256 obrigatória
      if (!signature) {
        res.status(401).json({
          error: 'GPN_SIGNATURE_REQUIRED',
          message: 'Header x-gpn-signature obrigatório para webhooks GPN.'
        });
        return;
      }

      const webhookSecret = gpnConnection.encryptedWebhookSecret
        ? CryptoService.decrypt(gpnConnection.encryptedWebhookSecret)
        : null;

      if (!webhookSecret) {
        res.status(500).json({
          error: 'GPN_CONFIG_ERROR',
          message: 'Webhook secret não configurado para esta organização.'
        });
        return;
      }

      const verification = GPNWhatsAppProvider.validateGpnSignature({
        signature,
        secret: webhookSecret,
        timestamp,
        eventId,
        rawBody
      });

      if (!verification.valid) {
        res.status(403).json({
          error: 'GPN_SIGNATURE_INVALID',
          message: verification.reason || 'Assinatura HMAC inválida.'
        });
        return;
      }

      // Verificação de idempotência (tenant-aware)
      try {
        await prisma.gpnWebhookEvent.create({
          data: {
            organizationId,
            eventId,
            eventType
          }
        });
      } catch (err: any) {
        // Unique constraint violation = evento já processado
        if (err.code === 'P2002') {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
        throw err;
      }

      // Responde 200 OK imediatamente
      res.status(200).json({ received: true });

      // Processa o evento em background
      try {
        switch (eventType) {
          case 'message.inbound':
            await this.handleMessageInbound(organizationId, body);
            break;
          case 'message.ack':
            await this.handleMessageAck(organizationId, body);
            break;
          case 'session.status':
            await this.handleSessionStatus(organizationId, body);
            break;
          default:
            console.warn(`[GPN Webhook] Evento desconhecido ignorado: ${eventType}`);
        }
      } catch (processError: any) {
        console.error(`[GPN Webhook] Erro ao processar evento ${eventType} (${eventId}):`, processError.message);
      }
    } catch (err: any) {
      console.error('[GPN Webhook] Erro geral no processamento:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
      }
    }
  }

  /**
   * Processa mensagem recebida de um contato WhatsApp via GPN.
   *
   * Payload esperado (data do webhook GPN):
   * {
   *   data: {
   *     messageId, remoteJid, text, pushName, timestamp, type, fromMe, ...
   *   }
   * }
   */
  private async handleMessageInbound(organizationId: string, body: any): Promise<void> {
    const data = body.data;
    if (!data) return;

    // Ignorar mensagens enviadas pelo próprio sistema (fromMe)
    if (data.fromMe) return;

    // Extrair telefone do JID do WhatsApp (ex: 5511999998888@s.whatsapp.net -> +5511999998888)
    const phone = this.extractPhoneFromJid(data.remoteJid || data.senderJid || '');
    if (!phone) return;

    const text = data.text || '';
    if (!text) return;

    await this.inboundUseCase.execute({
      organizationId,
      fromPhone: phone,
      text,
      providerMessageId: data.messageId || undefined
    });
  }

  /**
   * Processa ACK de entrega/leitura de mensagem enviada via GPN.
   *
   * Payload esperado (data do webhook GPN):
   * {
   *   data: {
   *     messageId, status (numérico), statusName, remoteJid, timestamp, ...
   *   }
   * }
   */
  private async handleMessageAck(organizationId: string, body: any): Promise<void> {
    const data = body.data;
    if (!data || !data.messageId) return;

    // Mapeamento de statusName do GPN para status do Conecta
    const statusMap: Record<string, string> = {
      'server': 'SENT',
      'delivered': 'DELIVERED',
      'read': 'READ',
      'played': 'READ',
      'error': 'FAILED',
      'pending': 'QUEUED'
    };

    const conectaStatus = statusMap[data.statusName] || null;
    if (!conectaStatus) return;

    const updateData: any = { status: conectaStatus };
    if (conectaStatus === 'DELIVERED') updateData.deliveredAt = new Date(data.timestamp || Date.now());
    if (conectaStatus === 'READ') updateData.readAt = new Date(data.timestamp || Date.now());
    if (conectaStatus === 'FAILED') updateData.errorMessage = `GPN ACK error (status code: ${data.status})`;

    // Atualiza apenas mensagens da organização correta (isolamento multi-tenant)
    await prisma.message.updateMany({
      where: {
        providerMessageId: data.messageId,
        organizationId
      },
      data: updateData
    });
  }

  /**
   * Processa mudança de status da sessão Baileys no GPN.
   *
   * Payload esperado (data do webhook GPN):
   * {
   *   data: {
   *     status: 'connected' | 'disconnected' | 'qr' | 'connecting' | ...,
   *     ...
   *   }
   * }
   */
  private async handleSessionStatus(organizationId: string, body: any): Promise<void> {
    const data = body.data;
    if (!data) return;

    const rawStatus = String(data.status || '').toLowerCase();

    // Mapeamento de status GPN para status do Conecta
    let conectaStatus = 'UNKNOWN';
    if (rawStatus === 'connected' || rawStatus === 'open') {
      conectaStatus = 'CONNECTED';
    } else if (rawStatus === 'disconnected' || rawStatus === 'close' || rawStatus === 'logged_out') {
      conectaStatus = 'DISCONNECTED';
    } else if (rawStatus === 'qr' || rawStatus === 'connecting') {
      conectaStatus = 'DISCONNECTED';
    } else if (rawStatus === 'error') {
      conectaStatus = 'ERROR';
    }

    await prisma.gpnConnection.update({
      where: { organizationId },
      data: { status: conectaStatus }
    });
  }

  /**
   * Extrai número de telefone puro de um JID do WhatsApp.
   * Ex: "5511999998888@s.whatsapp.net" -> "+5511999998888"
   */
  private extractPhoneFromJid(jid: string): string {
    if (!jid) return '';
    const num = jid.split('@')[0];
    if (!num || !/^\d+$/.test(num)) return '';
    return `+${num}`;
  }
}
