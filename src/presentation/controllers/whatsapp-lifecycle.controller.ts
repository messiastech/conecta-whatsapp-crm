import { Request, Response } from 'express';
import { WhatsAppLifecycleService } from '../../application/services/whatsapp-lifecycle.service.js';

/**
 * Controller responsável pela abstração do Ciclo de Vida do canal de WhatsApp do tenant.
 *
 * Expõe endpoints orientados a estados de canal para a interface do cliente:
 * - POST   /api/organization/whatsapp/connect
 * - GET    /api/organization/whatsapp/status
 * - POST   /api/organization/whatsapp/reconnect
 * - POST   /api/organization/whatsapp/replace
 * - DELETE /api/organization/whatsapp/disconnect
 */
function sanitizeChannelResponse<T extends Record<string, any>>(data: T): Omit<T, 'sessionId'> {
  if (!data || typeof data !== 'object') return data;
  const copy: any = { ...data };
  delete copy.sessionId;
  if (copy.pendingReplacement && typeof copy.pendingReplacement === 'object') {
    const { previousSessionId: _p, newSessionId: _n, ...restPending } = copy.pendingReplacement;
    copy.pendingReplacement = restPending;
  }
  return copy;
}

export class WhatsAppLifecycleController {
  /**
   * POST /api/organization/whatsapp/connect
   * Inicia o fluxo de pareamento: solicita sessão no GPN e retorna o QR Code.
   */
  async connect(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const info = await WhatsAppLifecycleService.connect(organizationId);
      res.status(200).json(sanitizeChannelResponse(info));
    } catch (err: any) {
      console.error('[WhatsAppLifecycleController.connect] Erro:', err.message);
      res.status(500).json({ error: 'WHATSAPP_CONNECT_ERROR', message: err.message });
    }
  }

  /**
   * GET /api/organization/whatsapp/status
   * Consulta o estado atual do canal, número conectado e última atividade.
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const info = await WhatsAppLifecycleService.getStatus(organizationId);
      res.status(200).json(sanitizeChannelResponse(info));
    } catch (err: any) {
      console.error('[WhatsAppLifecycleController.getStatus] Erro:', err.message);
      res.status(500).json({ error: 'WHATSAPP_STATUS_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/organization/whatsapp/reconnect
   * Solicita reconexão da sessão existente.
   */
  async reconnect(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const info = await WhatsAppLifecycleService.reconnect(organizationId);
      res.status(200).json(sanitizeChannelResponse(info));
    } catch (err: any) {
      console.error('[WhatsAppLifecycleController.reconnect] Erro:', err.message);
      res.status(500).json({ error: 'WHATSAPP_RECONNECT_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/organization/whatsapp/replace
   * Inicia o fluxo seguro de substituição do número de WhatsApp:
   * - Confirmação explícita
   * - Gera nova sessão / novo QR Code
   * - Preserva integralmente clientes, conversas, mensagens e tarefas
   * - Registra log formal de auditoria
   */
  async replace(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user?.id || 'system';
      const { confirm, reason } = req.body;

      if (!confirm) {
        res.status(400).json({
          error: 'CONFIRMATION_REQUIRED',
          message: 'Confirmação explícita obrigatória para substituição de número de WhatsApp.'
        });
        return;
      }

      const info = await WhatsAppLifecycleService.replaceNumber(organizationId, userId, reason);
      res.status(200).json(sanitizeChannelResponse({
        ...info,
        message: 'Substituição iniciada. Escaneie o novo QR Code com o novo aparelho. O histórico do tenant foi 100% preservado.'
      }));
    } catch (err: any) {
      console.error('[WhatsAppLifecycleController.replace] Erro:', err.message);
      res.status(500).json({ error: 'WHATSAPP_REPLACE_ERROR', message: err.message });
    }
  }

  /**
   * DELETE /api/organization/whatsapp/disconnect
   * Desconecta o aparelho e encerra a sessão ativamente.
   */
  async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const info = await WhatsAppLifecycleService.disconnect(organizationId, userId);
      res.status(200).json(sanitizeChannelResponse(info));
    } catch (err: any) {
      console.error('[WhatsAppLifecycleController.disconnect] Erro:', err.message);
      res.status(500).json({ error: 'WHATSAPP_DISCONNECT_ERROR', message: err.message });
    }
  }

  /**
   * POST /api/organization/whatsapp/replace/cancel
   * DELETE /api/organization/whatsapp/replace
   * Cancela a substituição de número pendente mantendo a sessão anterior ativa.
   */
  async cancelReplace(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const { reason } = req.body || {};

      const info = await WhatsAppLifecycleService.cancelReplaceNumber(organizationId, userId, reason);
      res.status(200).json(sanitizeChannelResponse({
        ...info,
        message: 'Substituição de número cancelada. A sessão anterior continua ativa e o staging foi limpo.'
      }));
    } catch (err: any) {
      console.error('[WhatsAppLifecycleController.cancelReplace] Erro:', err.message);
      res.status(500).json({ error: 'WHATSAPP_CANCEL_REPLACE_ERROR', message: err.message });
    }
  }
}
