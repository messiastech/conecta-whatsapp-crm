export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  recipientPhone: string;
  provider: 'MOCK' | 'META_CLOUD_API';
  status: 'SENT' | 'FAILED';
  timestamp: Date;
  errorMessage?: string;
  rawResponse?: any;
}

export interface InboundWhatsAppMessage {
  messageId: string;
  fromPhone: string; // Formato E.164
  text: string;
  timestamp: Date;
  rawPayload?: any;
}

export interface StatusUpdateWhatsAppEvent {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  errorMessage?: string;
}

export interface IWhatsAppProvider {
  /**
   * Envia uma mensagem baseada em template (exigido para mensagens iniciadas pela empresa)
   */
  sendTemplateMessage(
    to: string,
    templateName: string,
    parameters: Record<string, string>,
    fallbackBody?: string
  ): Promise<WhatsAppSendResult>;

  /**
   * Envia mensagem de texto livre (permitido apenas dentro da janela de 24h de resposta do usuário)
   */
  sendTextMessage(
    to: string,
    text: string
  ): Promise<WhatsAppSendResult>;

  /**
   * Valida o handshake inicial do webhook da Meta (hub.challenge)
   */
  verifyWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined
  ): string | null;

  /**
   * Valida a assinatura HMAC-SHA256 da requisição de webhook
   */
  validateSignature(
    rawBody: Buffer,
    signatureHeader?: string
  ): boolean;

  /**
   * Converte o payload bruto do webhook em eventos normalizados
   */
  parseWebhookPayload(
    body: any
  ): {
    messages: InboundWhatsAppMessage[];
    statuses: StatusUpdateWhatsAppEvent[];
  };
}
