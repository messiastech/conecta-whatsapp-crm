import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { CryptoService } from '../../infrastructure/security/crypto.service.js';
import { GPNWhatsAppProvider } from '../../infrastructure/whatsapp/gpn-whatsapp.provider.js';
import { ProcessInboundMessageUseCase } from '../../application/use-cases/process-inbound-message.use-case.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';
import { WhatsAppLifecycleService } from '../../application/services/whatsapp-lifecycle.service.js';

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

    // 1. Priorizar senderPhone real resolvido pelo GPN Core Gateway
    let phone = data.senderPhone ? String(data.senderPhone).trim() : '';

    // 2. Se senderPhone não foi informado, tentar extrair somente se for JID telefônico @s.whatsapp.net (NUNCA @lid)
    if (!phone) {
      phone = this.extractPhoneFromJid(data.senderJid || data.remoteJid || '');
    }

    const text = data.text || '';
    if (!text) return;

    // 3. Se a identidade não puder ser resolvida (ex: apenas @lid sem PN correspondente):
    if (!phone) {
      console.warn(
        `[GPN Webhook] Identidade não resolvida para mensagem ${data.messageId} (remoteJid: ${data.remoteJid}, senderLid: ${data.senderLid}). Marcando IDENTITY_UNRESOLVED.`
      );

      // Não auto-enviar, não criar telefone E.164 falso, registrar auditoria/incidente
      await prisma.auditLog.create({
        data: {
          organizationId,
          action: 'IDENTITY_UNRESOLVED',
          entityType: 'WhatsAppMessage',
          entityId: data.messageId || 'unknown',
          details: JSON.stringify({
            remoteJid: data.remoteJid,
            senderJid: data.senderJid,
            senderLid: data.senderLid,
            pushName: data.pushName,
            textSnippet: text.slice(0, 100),
            reason: 'Remetente utilizou WhatsApp LID sem mapeamento de número telefônico correspondente.'
          })
        }
      }).catch((err) => console.error('[GPN Webhook] Falha ao registrar log de IDENTITY_UNRESOLVED:', err.message));

      return;
    }

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

    // Mapeamento de status/statusName do GPN para status do Conecta
    const rawStatus = String(data.statusName || data.status || '').toLowerCase();
    const statusMap: Record<string, string> = {
      'server': 'SENT',
      'sent': 'SENT',
      '2': 'SENT',
      'delivered': 'DELIVERED',
      '3': 'DELIVERED',
      'read': 'READ',
      'played': 'READ',
      '4': 'READ',
      '5': 'READ',
      'error': 'FAILED',
      'failed': 'FAILED',
      '0': 'FAILED',
      'pending': 'QUEUED',
      '1': 'QUEUED'
    };

    const conectaStatus = statusMap[rawStatus] || null;
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
   * Suporta:
   * 1. Substituição de número em duas fases (Two-Phase Replacement):
   *    - Se o evento for para pendingSessionId, somente promove para ativa quando conectado,
   *      ou limpa staging se falhar.
   * 2. Sessão corrente normal:
   *    - Atualiza status do GpnConnection e canal WhatsApp.
   *    - Ao receber session.status: connected, resolve incidentes operacionais pendentes.
   *
   * Payload esperado (data do webhook GPN):
   * {
   *   sessionId?: string,
   *   data: {
   *     sessionId?: string,
   *     status: 'connected' | 'disconnected' | 'qr' | 'connecting' | ...,
   *     phone?: string,
   *     qr?: string,
   *     ...
   *   }
   * }
   */
  private async handleSessionStatus(organizationId: string, body: any): Promise<void> {
    const data = body.data;
    if (!data) return;

    const rawStatus = String(data.status || '').toLowerCase();
    const eventSessionId = body.sessionId || data.sessionId;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });
    if (!org) return;

    let metadata: any = {};
    if (org.metadata) {
      try { metadata = JSON.parse(org.metadata); } catch {}
    }

    const pending = metadata.pendingWhatsAppReplacement;
    const isPendingSession = Boolean(
      pending &&
      pending.newSessionId &&
      eventSessionId &&
      eventSessionId === pending.newSessionId
    );

    // === FLUXO 1: Evento para sessão pendente em staging (Two-Phase Replacement) ===
    if (isPendingSession) {
      if (rawStatus === 'connected' || rawStatus === 'open') {
        const phone = data.phone || (data.user?.id ? this.extractPhoneFromJid(data.user.id) : undefined);

        // 1. Promove a nova sessão para ativa no GpnConnection
        await prisma.gpnConnection.update({
          where: { organizationId },
          data: {
            sessionId: pending.newSessionId,
            status: 'CONNECTED'
          }
        });

        // 2. Atualiza metadados do canal de WhatsApp com o novo número e status CONECTADO
        await WhatsAppLifecycleService.updateSessionStatus(organizationId, {
          status: 'connected',
          phone,
          sessionId: pending.newSessionId
        });

        // 3. Encerra sessão anterior no GPN
        if (org.gpnConnection && pending.previousSessionId) {
          try {
            const gpnConfig = WhatsAppLifecycleService.getGpnConfig(org.gpnConnection);
            const provider = new GPNWhatsAppProvider({
              ...gpnConfig,
              sessionId: pending.previousSessionId
            });
            await provider.deleteSession(pending.previousSessionId).catch((err: any) => {
              console.warn('[GPN Webhook] Falha ao encerrar sessão anterior no GPN:', err.message);
            });
          } catch (err: any) {
            console.warn('[GPN Webhook] Erro ao instanciar provedor para encerrar sessão anterior:', err.message);
          }
        }

        // 4. Registra AuditLog da conclusão da substituição
        await prisma.auditLog.create({
          data: {
            organizationId,
            userId: pending.userId || null,
            action: 'WHATSAPP_NUMBER_REPLACED_COMPLETED',
            entityType: 'WhatsAppChannel',
            entityId: pending.newSessionId,
            details: JSON.stringify({
              previousSessionId: pending.previousSessionId,
              newSessionId: pending.newSessionId,
              phone: phone || null,
              reason: pending.reason || null,
              completedAt: new Date().toISOString()
            })
          }
        });

        // 5. Remove pendingWhatsAppReplacement de Organization.metadata
        const currentOrg = await prisma.organization.findUnique({ where: { id: organizationId } });
        let latestMeta: any = {};
        if (currentOrg?.metadata) {
          try { latestMeta = JSON.parse(currentOrg.metadata); } catch {}
        }
        delete latestMeta.pendingWhatsAppReplacement;
        await prisma.organization.update({
          where: { id: organizationId },
          data: { metadata: JSON.stringify(latestMeta) }
        });

        // 6. Resolve incidentes operacionais GPN pendentes
        await WhatsAppLifecycleService.resolveGpnIncident(organizationId);
      } else if (rawStatus === 'error' || rawStatus === 'failed') {
        // Se a nova sessão falhar, a sessão anterior permanece intacta e o staging é limpo
        await WhatsAppLifecycleService.cancelReplaceNumber(
          organizationId,
          pending.userId,
          `Falha ao conectar novo número no gateway GPN (${rawStatus})`
        );
      } else if (rawStatus === 'qr' || rawStatus === 'waiting_qr') {
        pending.qrCode = data.qr || data.qrcode || pending.qrCode;
        pending.status = 'AGUARDANDO_QR';
        metadata.pendingWhatsAppReplacement = pending;
        await prisma.organization.update({
          where: { id: organizationId },
          data: { metadata: JSON.stringify(metadata) }
        });
      } else if (rawStatus === 'connecting') {
        pending.status = 'CONECTANDO';
        metadata.pendingWhatsAppReplacement = pending;
        await prisma.organization.update({
          where: { id: organizationId },
          data: { metadata: JSON.stringify(metadata) }
        });
      }

      return;
    }

    // === FLUXO 2: Evento para sessão corrente normal ===
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

    // Sincroniza metadados do canal de WhatsApp com o ciclo de vida
    const phone = data.phone || (data.user?.id ? this.extractPhoneFromJid(data.user.id) : undefined);
    await WhatsAppLifecycleService.updateSessionStatus(organizationId, {
      status: rawStatus,
      phone,
      qr: data.qr || data.qrcode
    });

    // Ao receber session.status: connected (recuperação), resolve incidentes operacionais pendentes
    if (conectaStatus === 'CONNECTED') {
      await WhatsAppLifecycleService.resolveGpnIncident(organizationId);
    }
  }

  /**
   * Extrai número de telefone puro de um JID do WhatsApp.
   * REGRA P0: NUNCA converter @lid em número de telefone! Apenas @s.whatsapp.net é aceito.
   * Ex: "5511999998888@s.whatsapp.net" -> "+5511999998888"
   */
  private extractPhoneFromJid(jid: string): string {
    if (!jid) return '';
    const cleanJid = String(jid).trim();
    if (cleanJid.endsWith('@lid')) return '';
    const num = cleanJid.split('@')[0].split(':')[0];
    if (!num || !/^\d+$/.test(num) || num.length < 8 || num.length > 15) return '';
    return `+${num}`;
  }
}
