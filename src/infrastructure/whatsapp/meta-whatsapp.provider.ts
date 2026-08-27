import crypto from 'crypto';
import {
  IWhatsAppProvider,
  WhatsAppSendResult,
  InboundWhatsAppMessage,
  StatusUpdateWhatsAppEvent
} from '../../domain/ports/whatsapp-provider.port.js';

export interface MetaWhatsAppConfig {
  apiUrl: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
}

export class MetaWhatsAppProvider implements IWhatsAppProvider {
  constructor(private config: MetaWhatsAppConfig) {}

  verifyWebhook(mode?: string, token?: string, challenge?: string): string | null {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return challenge || null;
    }
    return null;
  }

  validateSignature(rawBody: Buffer, signatureHeader?: string): boolean {
    if (!signatureHeader || !this.config.appSecret) return false;
    if (!signatureHeader.startsWith('sha256=')) return false;

    const signature = signatureHeader.substring(7);
    const expectedHash = crypto
      .createHmac('sha256', this.config.appSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedHash, 'utf8');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    parameters: Record<string, string>,
    _fallbackBody?: string
  ): Promise<WhatsAppSendResult> {
    const cleanTo = to.replace(/\D/g, '');
    const url = `${this.config.apiUrl}/${this.config.phoneNumberId}/messages`;

    // Converte parâmetros de objeto para o formato da Graph API
    const paramsList = Object.values(parameters).map(val => ({
      type: 'text',
      text: val
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components: [
          {
            type: 'body',
            parameters: paramsList
          }
        ]
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          messageId: '',
          recipientPhone: to,
          provider: 'META_CLOUD_API',
          status: 'FAILED',
          timestamp: new Date(),
          errorMessage: data?.error?.message || `Erro HTTP ${response.status} na Graph API`,
          rawResponse: data
        };
      }

      const messageId = data?.messages?.[0]?.id || 'unknown_meta_id';
      return {
        success: true,
        messageId,
        recipientPhone: to,
        provider: 'META_CLOUD_API',
        status: 'SENT',
        timestamp: new Date(),
        rawResponse: data
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        recipientPhone: to,
        provider: 'META_CLOUD_API',
        status: 'FAILED',
        timestamp: new Date(),
        errorMessage: err.message
      };
    }
  }

  async sendTextMessage(to: string, text: string): Promise<WhatsAppSendResult> {
    const cleanTo = to.replace(/\D/g, '');
    const url = `${this.config.apiUrl}/${this.config.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body: text }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          messageId: '',
          recipientPhone: to,
          provider: 'META_CLOUD_API',
          status: 'FAILED',
          timestamp: new Date(),
          errorMessage: data?.error?.message || `Erro HTTP ${response.status} na Graph API`,
          rawResponse: data
        };
      }

      const messageId = data?.messages?.[0]?.id || '';
      return {
        success: true,
        messageId,
        recipientPhone: to,
        provider: 'META_CLOUD_API',
        status: 'SENT',
        timestamp: new Date(),
        rawResponse: data
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        recipientPhone: to,
        provider: 'META_CLOUD_API',
        status: 'FAILED',
        timestamp: new Date(),
        errorMessage: err.message
      };
    }
  }

  parseWebhookPayload(body: any): {
    messages: InboundWhatsAppMessage[];
    statuses: StatusUpdateWhatsAppEvent[];
  } {
    const messages: InboundWhatsAppMessage[] = [];
    const statuses: StatusUpdateWhatsAppEvent[] = [];

    if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body?.entry)) {
      return { messages, statuses };
    }

    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // 1. Mensagens recebidas
        if (Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            let textBody = '';
            if (msg.type === 'text') {
              textBody = msg.text?.body || '';
            } else if (msg.type === 'button') {
              textBody = msg.button?.text || '';
            } else if (msg.type === 'interactive') {
              textBody = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
            }

            if (textBody) {
              messages.push({
                messageId: msg.id,
                fromPhone: msg.from.startsWith('+') ? msg.from : `+${msg.from}`,
                text: textBody,
                timestamp: new Date(Number(msg.timestamp) * 1000),
                rawPayload: msg
              });
            }
          }
        }

        // 2. Atualizações de status
        if (Array.isArray(value.statuses)) {
          for (const st of value.statuses) {
            statuses.push({
              messageId: st.id,
              status: st.status,
              timestamp: new Date(Number(st.timestamp) * 1000),
              errorMessage: st.errors?.[0]?.message
            });
          }
        }
      }
    }

    return { messages, statuses };
  }
}
