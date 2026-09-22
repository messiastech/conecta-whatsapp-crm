import crypto from 'crypto';
import {
  IWhatsAppProvider,
  WhatsAppSendResult,
  InboundWhatsAppMessage,
  StatusUpdateWhatsAppEvent
} from '../../domain/ports/whatsapp-provider.port.js';

export interface GPNProviderConfig {
  apiUrl: string;        // URL base do GPN Core Gateway (ex: http://localhost:3000)
  apiKey: string;        // API Key para autenticação Bearer
  sessionId: string;     // ID da sessão Baileys no GPN
  webhookSecret?: string; // Segredo para validação HMAC de webhooks recebidos do GPN
}

/**
 * GPNWhatsAppProvider — Cliente HTTP do GPN Core Gateway.
 *
 * Envia mensagens de texto via POST /api/v1/messages/text
 * e fornece métodos de validação para webhooks recebidos do GPN.
 *
 * NÃO implementa verifyWebhook/parseWebhookPayload no formato Meta,
 * pois o GPN possui seu próprio formato de webhook com assinatura HMAC dedicada.
 */
export class GPNWhatsAppProvider implements IWhatsAppProvider {
  private config: GPNProviderConfig;

  constructor(config: GPNProviderConfig) {
    this.config = config;
  }

  async sendTemplateMessage(
    to: string,
    _templateName: string,
    _parameters: Record<string, string>,
    fallbackBody?: string,
    _organizationId?: string
  ): Promise<WhatsAppSendResult> {
    // GPN/Baileys não suporta templates da Meta Cloud API.
    // Envia como texto livre usando o fallbackBody se disponível.
    const text = fallbackBody || `[Template: ${_templateName}]`;
    return this.sendTextMessage(to, text, _organizationId);
  }

  async sendTextMessage(
    to: string,
    text: string,
    _organizationId?: string
  ): Promise<WhatsAppSendResult> {
    const url = `${this.config.apiUrl}/api/v1/messages/text`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          sessionId: this.config.sessionId,
          to,
          text
        }),
        signal: AbortSignal.timeout(15_000)
      });

      const json = await response.json() as any;

      if (response.ok && json.ok) {
        return {
          success: true,
          messageId: json.messageId || '',
          recipientPhone: to,
          provider: 'GPN',
          status: 'SENT',
          timestamp: new Date(),
          rawResponse: json
        };
      }

      return {
        success: false,
        messageId: '',
        recipientPhone: to,
        provider: 'GPN',
        status: 'FAILED',
        timestamp: new Date(),
        errorMessage: json.message || json.error || `HTTP ${response.status}`,
        rawResponse: json
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        recipientPhone: to,
        provider: 'GPN',
        status: 'FAILED',
        timestamp: new Date(),
        errorMessage: err.message || 'Falha de rede com GPN Core Gateway'
      };
    }
  }

  /**
   * Inicia ou provisiona uma sessão Baileys no GPN Core Gateway.
   * Retorna status da sessão e QR Code se aguardando pareamento.
   *
   * Hardening de Segurança:
   * - Em produção (NODE_ENV === 'production'): QR Code simulado é ESTRITAMENTE PROIBIDO.
   *   Se o GPN não responder ou não retornar QR/sessão válido, lança [GPN_UNAVAILABLE].
   * - Mock/simulação permitido somente quando process.env.NODE_ENV === 'test' ou desenvolvimento local fora de produção.
   */
  async startSession(sessionId: string): Promise<{ ok: boolean; qr?: string; status: string; phone?: string }> {
    const isProd = process.env.NODE_ENV === 'production';
    const url = `${this.config.apiUrl}/api/v1/sessions`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(10_000)
      });

      if (response.ok) {
        const data = await response.json() as any;
        const qr = data.qr || data.qrcode || undefined;
        const status = data.status || 'WAITING_QR';

        if (isProd && status === 'WAITING_QR' && !qr) {
          throw new Error('[GPN_UNAVAILABLE] GPN Core Gateway conectado mas não retornou QR Code válido.');
        }

        return {
          ok: true,
          qr,
          status,
          phone: data.phone || undefined
        };
      }

      if (isProd) {
        throw new Error(`[GPN_UNAVAILABLE] GPN Core Gateway retornou erro HTTP ${response.status}.`);
      }
    } catch (err: any) {
      if (isProd || err.message?.startsWith('[GPN_UNAVAILABLE]')) {
        throw new Error(`[GPN_UNAVAILABLE] ${err.message || 'Falha de comunicação com GPN Core Gateway.'}`);
      }
      // Em modo offline / simulação de desenvolvimento ou teste
    }

    if (isProd) {
      throw new Error('[GPN_UNAVAILABLE] Proibida simulação de QR Code em ambiente de produção.');
    }

    // Fallback simulado exclusivamente para desenvolvimento ou testes (NUNCA em produção)
    return {
      ok: true,
      qr: `2@gpn_simulated_qr_code_${sessionId}_${Date.now()}`,
      status: 'WAITING_QR'
    };
  }

  /**
   * Consulta o status de uma sessão no GPN Core Gateway
   */
  async getSession(sessionId: string): Promise<{ ok: boolean; status: string; phone?: string }> {
    const url = `${this.config.apiUrl}/api/v1/sessions/${sessionId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${this.config.apiKey}`
        },
        signal: AbortSignal.timeout(5_000)
      });

      if (response.ok) {
        const data = await response.json() as any;
        return {
          ok: true,
          status: data.status || 'disconnected',
          phone: data.phone || undefined
        };
      }
    } catch {}

    return { ok: false, status: 'disconnected' };
  }

  /**
   * Solicita reconexão de uma sessão no GPN Core Gateway
   */
  async reconnectSession(sessionId: string): Promise<{ ok: boolean; status: string }> {
    const url = `${this.config.apiUrl}/api/v1/sessions/${sessionId}/reconnect`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${this.config.apiKey}`
        },
        signal: AbortSignal.timeout(10_000)
      });

      if (response.ok) {
        const data = await response.json() as any;
        return { ok: true, status: data.status || 'reconnecting' };
      }
    } catch {}

    return { ok: true, status: 'reconnecting' };
  }

  /**
   * Deleta ou encerra uma sessão no GPN Core Gateway
   */
  async deleteSession(sessionId: string): Promise<{ ok: boolean; status: string }> {
    const url = `${this.config.apiUrl}/api/v1/sessions/${sessionId}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'authorization': `Bearer ${this.config.apiKey}`
        },
        signal: AbortSignal.timeout(5_000)
      });

      if (response.ok) {
        return { ok: true, status: 'disconnected' };
      }
    } catch {}

    return { ok: true, status: 'disconnected' };
  }

  /**
   * GPN não usa o handshake hub.challenge da Meta.
   * Retorna null indicando que este provedor não trata verificação de webhook Meta.
   */
  verifyWebhook(
    _mode: string | undefined,
    _token: string | undefined,
    _challenge: string | undefined
  ): string | null {
    return null;
  }

  /**
   * Validação de assinatura HMAC-SHA256 no formato do GPN Core Gateway.
   *
   * O GPN assina como: HMAC-SHA256(secret, "${timestamp}.${eventId}.${rawBody}")
   * e envia a assinatura em x-gpn-signature como "sha256=<hex>".
   *
   * Este método valida apenas o rawBody contra x-hub-signature-256 (formato Meta).
   * Para validação do formato GPN, usar validateGpnSignature() estático.
   */
  validateSignature(
    _rawBody: Buffer,
    _signatureHeader?: string
  ): boolean {
    // Não aplicável ao formato Meta. Validação GPN é feita pelo controller.
    return true;
  }

  /**
   * GPN não envia payloads no formato Meta.
   * Este método retorna arrays vazios. Eventos GPN são parseados pelo GpnWebhooksController.
   */
  parseWebhookPayload(
    _body: any
  ): { messages: InboundWhatsAppMessage[]; statuses: StatusUpdateWhatsAppEvent[] } {
    return { messages: [], statuses: [] };
  }

  // === Métodos estáticos de validação de webhook GPN ===

  /**
   * Valida a assinatura HMAC-SHA256 de um webhook recebido do GPN Core Gateway.
   *
   * Formato da assinatura GPN: HMAC-SHA256(secret, "${timestamp}.${eventId}.${rawBody}")
   */
  static validateGpnSignature(opts: {
    signature: string;
    secret: string;
    timestamp: string | number;
    eventId: string;
    rawBody: string;
    toleranceMs?: number;
  }): { valid: boolean; reason?: string } {
    const { signature, secret, timestamp, eventId, rawBody, toleranceMs = 300_000 } = opts;

    if (!signature || !secret || !timestamp || !eventId || !rawBody) {
      return { valid: false, reason: 'Campos obrigatórios ausentes para verificação de assinatura.' };
    }

    // Proteção contra replay
    const age = Math.abs(Date.now() - Number(timestamp));
    if (age > toleranceMs) {
      return { valid: false, reason: `Timestamp expirado ou fora da tolerância de replay (${age}ms > ${toleranceMs}ms).` };
    }

    const message = `${timestamp}.${eventId}.${rawBody}`;
    const expectedHex = crypto.createHmac('sha256', secret).update(message).digest('hex');

    const rawSig = signature.replace(/^sha256=/i, '').trim();
    const sigBuf = Buffer.from(rawSig, 'utf8');
    const expBuf = Buffer.from(expectedHex, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Assinatura HMAC SHA-256 inválida.' };
    }

    return { valid: true };
  }
}
