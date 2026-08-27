import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  IWhatsAppProvider,
  WhatsAppSendResult,
  InboundWhatsAppMessage,
  StatusUpdateWhatsAppEvent
} from '../../domain/ports/whatsapp-provider.port.js';

export interface SandboxMessageLog {
  id: string;
  direction: 'OUTBOUND' | 'INBOUND';
  toOrFrom: string;
  text: string;
  templateName?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

export class MockWhatsAppProvider implements IWhatsAppProvider {
  private static instance: MockWhatsAppProvider;
  private eventEmitter: EventEmitter = new EventEmitter();
  private messageHistory: SandboxMessageLog[] = [];
  private failNextSend: boolean = false;

  public constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  public static getInstance(): MockWhatsAppProvider {
    if (!MockWhatsAppProvider.instance) {
      MockWhatsAppProvider.instance = new MockWhatsAppProvider();
    }
    return MockWhatsAppProvider.instance;
  }

  public getEventsEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  public getHistory(): SandboxMessageLog[] {
    return [...this.messageHistory];
  }

  public setFailNextSend(fail: boolean): void {
    this.failNextSend = fail;
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    parameters: Record<string, string>,
    fallbackBody?: string
  ): Promise<WhatsAppSendResult> {
    const messageId = `wamid.mock_${uuidv4().substring(0, 18)}`;

    if (this.failNextSend) {
      this.failNextSend = false;
      return {
        success: false,
        messageId,
        recipientPhone: to,
        provider: 'MOCK',
        status: 'FAILED',
        timestamp: new Date(),
        errorMessage: 'Simulação de erro na entrega do WhatsApp (Erro 131026: Número não existe ou sem rede)'
      };
    }

    let renderedText = fallbackBody || `[Template: ${templateName}]`;
    for (const [key, val] of Object.entries(parameters)) {
      renderedText = renderedText.replace(new RegExp(`{{${key}}}`, 'g'), val);
    }

    const logEntry: SandboxMessageLog = {
      id: messageId,
      direction: 'OUTBOUND',
      toOrFrom: to,
      text: renderedText,
      templateName,
      status: 'sent',
      timestamp: new Date()
    };

    this.messageHistory.push(logEntry);

    // Emite evento em tempo real para o simulador
    this.eventEmitter.emit('sandbox_event', {
      type: 'OUTGOING_MESSAGE',
      message: logEntry
    });

    // Simula transição automática de status (delivered após 400ms, read após 1200ms)
    setTimeout(() => {
      logEntry.status = 'delivered';
      this.eventEmitter.emit('sandbox_event', {
        type: 'STATUS_UPDATE',
        messageId,
        status: 'delivered',
        timestamp: new Date()
      });
    }, 400);

    setTimeout(() => {
      logEntry.status = 'read';
      this.eventEmitter.emit('sandbox_event', {
        type: 'STATUS_UPDATE',
        messageId,
        status: 'read',
        timestamp: new Date()
      });
    }, 1200);

    return {
      success: true,
      messageId,
      recipientPhone: to,
      provider: 'MOCK',
      status: 'SENT',
      timestamp: new Date()
    };
  }

  async sendTextMessage(to: string, text: string): Promise<WhatsAppSendResult> {
    const messageId = `wamid.mock_${uuidv4().substring(0, 18)}`;

    const logEntry: SandboxMessageLog = {
      id: messageId,
      direction: 'OUTBOUND',
      toOrFrom: to,
      text,
      status: 'sent',
      timestamp: new Date()
    };

    this.messageHistory.push(logEntry);

    this.eventEmitter.emit('sandbox_event', {
      type: 'OUTGOING_MESSAGE',
      message: logEntry
    });

    setTimeout(() => {
      logEntry.status = 'delivered';
      this.eventEmitter.emit('sandbox_event', {
        type: 'STATUS_UPDATE',
        messageId,
        status: 'delivered',
        timestamp: new Date()
      });
    }, 300);

    setTimeout(() => {
      logEntry.status = 'read';
      this.eventEmitter.emit('sandbox_event', {
        type: 'STATUS_UPDATE',
        messageId,
        status: 'read',
        timestamp: new Date()
      });
    }, 900);

    return {
      success: true,
      messageId,
      recipientPhone: to,
      provider: 'MOCK',
      status: 'SENT',
      timestamp: new Date()
    };
  }

  verifyWebhook(mode?: string, token?: string, challenge?: string): string | null {
    if (mode === 'subscribe' && token) {
      return challenge || 'OK_MOCK';
    }
    return challenge || 'OK_MOCK';
  }

  validateSignature(_rawBody: Buffer, _signatureHeader?: string): boolean {
    return true; // Mock sandbox aceita assinaturas mock
  }

  parseWebhookPayload(body: any): {
    messages: InboundWhatsAppMessage[];
    statuses: StatusUpdateWhatsAppEvent[];
  } {
    const messages: InboundWhatsAppMessage[] = [];
    const statuses: StatusUpdateWhatsAppEvent[] = [];

    if (body && body.from && body.text) {
      const msg: InboundWhatsAppMessage = {
        messageId: body.messageId || `wamid.mock_in_${uuidv4().substring(0, 16)}`,
        fromPhone: body.from,
        text: body.text,
        timestamp: new Date(),
        rawPayload: body
      };
      messages.push(msg);

      this.messageHistory.push({
        id: msg.messageId,
        direction: 'INBOUND',
        toOrFrom: msg.fromPhone,
        text: msg.text,
        status: 'read',
        timestamp: msg.timestamp
      });

      this.eventEmitter.emit('sandbox_event', {
        type: 'INCOMING_MESSAGE',
        message: msg
      });
    }

    return { messages, statuses };
  }

  /**
   * Helper chamado pelo endpoint de simulação para injetar respostas do participante
   */
  public simulateIncomingReply(fromPhone: string, text: string): InboundWhatsAppMessage {
    const messageId = `wamid.mock_in_${uuidv4().substring(0, 16)}`;
    const msg: InboundWhatsAppMessage = {
      messageId,
      fromPhone,
      text,
      timestamp: new Date(),
      rawPayload: { simulated: true, from: fromPhone, text }
    };

    this.messageHistory.push({
      id: messageId,
      direction: 'INBOUND',
      toOrFrom: fromPhone,
      text,
      status: 'read',
      timestamp: msg.timestamp
    });

    this.eventEmitter.emit('sandbox_event', {
      type: 'INCOMING_MESSAGE',
      message: msg
    });

    return msg;
  }
}
