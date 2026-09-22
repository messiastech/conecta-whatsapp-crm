import { prisma } from '../../infrastructure/database/prisma.client.js';
import { CryptoService } from '../../infrastructure/security/crypto.service.js';
import { GPNWhatsAppProvider } from '../../infrastructure/whatsapp/gpn-whatsapp.provider.js';
import crypto from 'crypto';

export type WhatsAppChannelStatus =
  | 'NAO_CONECTADO'
  | 'AGUARDANDO_QR'
  | 'CONECTANDO'
  | 'CONECTADO'
  | 'DESCONECTADO'
  | 'ERRO';

export interface WhatsAppChannelInfo {
  status: WhatsAppChannelStatus;
  connectedPhone?: string | null;
  connectedAt?: string | null;
  lastActivityAt?: string | null;
  qrCode?: string | null;
  sessionId?: string | null;
  provider: 'GPN';
  isOperating: boolean;
  errorMessage?: string | null;
}

export class WhatsAppLifecycleService {
  private static getGpnConfig(gpnConnection: any) {
    const apiUrl = gpnConnection.apiUrl || process.env.GPN_API_URL || 'http://localhost:3000';
    const apiKey = gpnConnection.encryptedApiKey
      ? CryptoService.decrypt(gpnConnection.encryptedApiKey)
      : (process.env.GPN_API_KEY || 'gpn_default_key');
    const sessionId = gpnConnection.sessionId || 'default';
    const webhookSecret = gpnConnection.encryptedWebhookSecret
      ? CryptoService.decrypt(gpnConnection.encryptedWebhookSecret)
      : undefined;

    return { apiUrl, apiKey, sessionId, webhookSecret };
  }

  /**
   * Obtém as informações do canal de WhatsApp do tenant a partir de Organization.metadata
   */
  public static async getStatus(organizationId: string): Promise<WhatsAppChannelInfo> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });

    if (!org) {
      throw new Error('Organização não encontrada');
    }

    let channelData: any = {};
    if (org.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.whatsappChannel) {
          channelData = meta.whatsappChannel;
        }
      } catch {}
    }

    // Sincroniza status com o GpnConnection se disponível
    const gpnStatus = org.gpnConnection?.status;
    let computedStatus: WhatsAppChannelStatus = channelData.status || 'NAO_CONECTADO';

    if (gpnStatus === 'CONNECTED') {
      computedStatus = 'CONECTADO';
    } else if (gpnStatus === 'DISCONNECTED' && computedStatus === 'CONECTADO') {
      computedStatus = 'DESCONECTADO';
    } else if (gpnStatus === 'ERROR') {
      computedStatus = 'ERRO';
    }

    return {
      status: computedStatus,
      connectedPhone: channelData.connectedPhone || null,
      connectedAt: channelData.connectedAt || null,
      lastActivityAt: channelData.lastActivityAt || org.gpnConnection?.updatedAt?.toISOString() || null,
      qrCode: computedStatus === 'AGUARDANDO_QR' ? (channelData.qrCode || null) : null,
      sessionId: org.gpnConnection?.sessionId || channelData.sessionId || 'default',
      provider: 'GPN',
      isOperating: computedStatus === 'CONECTADO',
      errorMessage: channelData.errorMessage || null
    };
  }

  /**
   * Inicia o fluxo de conexão do canal de WhatsApp:
   * Solicita criação/ativação de sessão no GPN Core Gateway e retorna o QR Code.
   */
  public static async connect(organizationId: string): Promise<WhatsAppChannelInfo> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });

    if (!org) {
      throw new Error('Organização não encontrada');
    }

    const sessionId = org.gpnConnection?.sessionId || `org-${org.slug || organizationId}`;

    // Garante o registro do GpnConnection
    let gpnConn = org.gpnConnection;
    if (!gpnConn) {
      const defaultApiKey = process.env.GPN_API_KEY || 'gpn_auto_provisioned_key';
      const defaultWebhookSecret = process.env.GPN_WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex');

      gpnConn = await prisma.gpnConnection.create({
        data: {
          organizationId,
          apiUrl: process.env.GPN_API_URL || 'http://localhost:3000',
          sessionId,
          encryptedApiKey: CryptoService.encrypt(defaultApiKey),
          encryptedWebhookSecret: CryptoService.encrypt(defaultWebhookSecret),
          isActive: true,
          status: 'DISCONNECTED'
        }
      });
    }

    const gpnConfig = this.getGpnConfig(gpnConn);
    const provider = new GPNWhatsAppProvider(gpnConfig);

    // Solicita início da sessão ao GPN Gateway
    const sessionRes = await provider.startSession(sessionId);

    // Gera ou extrai QR Code retornado
    const qrCode = sessionRes.qr || `2@mock_gpn_qr_code_${sessionId}_${Date.now()}`;
    const status: WhatsAppChannelStatus = sessionRes.status === 'CONNECTED' ? 'CONECTADO' : 'AGUARDANDO_QR';

    // Salva metadados do canal no metadata da organização
    await this.saveChannelMetadata(organizationId, {
      status,
      sessionId,
      qrCode: status === 'AGUARDANDO_QR' ? qrCode : null,
      connectedAt: status === 'CONECTADO' ? new Date().toISOString() : null,
      lastActivityAt: new Date().toISOString()
    });

    return {
      status,
      connectedPhone: sessionRes.phone || null,
      connectedAt: status === 'CONECTADO' ? new Date().toISOString() : null,
      lastActivityAt: new Date().toISOString(),
      qrCode: status === 'AGUARDANDO_QR' ? qrCode : null,
      sessionId,
      provider: 'GPN',
      isOperating: status === 'CONECTADO'
    };
  }

  /**
   * Solicita reconexão da sessão atual
   */
  public static async reconnect(organizationId: string): Promise<WhatsAppChannelInfo> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });

    if (!org) throw new Error('Organização não encontrada');
    if (!org.gpnConnection) throw new Error('Canal WhatsApp não inicializado para esta organização');

    const gpnConfig = this.getGpnConfig(org.gpnConnection);
    const provider = new GPNWhatsAppProvider(gpnConfig);

    const res = await provider.reconnectSession(org.gpnConnection.sessionId);

    const status: WhatsAppChannelStatus = res.status === 'CONNECTED' ? 'CONECTADO' : 'CONECTANDO';

    await this.saveChannelMetadata(organizationId, {
      status,
      lastActivityAt: new Date().toISOString()
    });

    return this.getStatus(organizationId);
  }

  /**
   * Substituição do número de WhatsApp:
   * 1. Preserva todos os dados do tenant (clientes, conversas, tarefas, métricas).
   * 2. Registra auditoria da troca.
   * 3. Cria nova sessão e gera novo QR Code.
   */
  public static async replaceNumber(
    organizationId: string,
    userId: string,
    reason?: string
  ): Promise<WhatsAppChannelInfo> {
    const currentStatus = await this.getStatus(organizationId);
    const previousPhone = currentStatus.connectedPhone || 'Nenhum';

    const newSessionId = `org-replace-${Date.now()}`;

    // Atualiza a sessão no GpnConnection
    await prisma.gpnConnection.update({
      where: { organizationId },
      data: {
        sessionId: newSessionId,
        status: 'DISCONNECTED'
      }
    });

    // Registra Auditoria Oficial
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'WHATSAPP_NUMBER_REPLACED',
        entityType: 'WhatsAppChannel',
        entityId: newSessionId,
        details: JSON.stringify({
          previousNumber: previousPhone,
          newSessionId,
          reason: reason || 'Substituição operacional solicitada pelo usuário',
          date: new Date().toISOString(),
          preservedEntities: ['persons', 'conversations', 'messages', 'followUpTasks', 'aiAnalyses']
        })
      }
    });

    // Inicia nova sessão para obtenção do novo QR Code
    return this.connect(organizationId);
  }

  /**
   * Desconecta a sessão de WhatsApp controladamente
   */
  public static async disconnect(organizationId: string, userId?: string): Promise<WhatsAppChannelInfo> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });

    if (!org) throw new Error('Organização não encontrada');

    if (org.gpnConnection) {
      const gpnConfig = this.getGpnConfig(org.gpnConnection);
      const provider = new GPNWhatsAppProvider(gpnConfig);
      await provider.deleteSession(org.gpnConnection.sessionId).catch(console.error);

      await prisma.gpnConnection.update({
        where: { organizationId },
        data: { status: 'DISCONNECTED' }
      });
    }

    if (userId) {
      await prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'WHATSAPP_DISCONNECTED',
          entityType: 'WhatsAppChannel',
          details: JSON.stringify({ date: new Date().toISOString() })
        }
      });
    }

    await this.saveChannelMetadata(organizationId, {
      status: 'DESCONECTADO',
      qrCode: null,
      lastActivityAt: new Date().toISOString()
    });

    return this.getStatus(organizationId);
  }

  /**
   * Atualiza status recebido de webhook do GPN Core Gateway em tempo real
   */
  public static async updateSessionStatus(
    organizationId: string,
    data: { status: string; phone?: string; qr?: string }
  ): Promise<void> {
    const raw = String(data.status || '').toLowerCase();
    let computedStatus: WhatsAppChannelStatus = 'ERRO';

    if (raw === 'connected' || raw === 'open') {
      computedStatus = 'CONECTADO';
    } else if (raw === 'qr' || raw === 'waiting_qr') {
      computedStatus = 'AGUARDANDO_QR';
    } else if (raw === 'connecting') {
      computedStatus = 'CONECTANDO';
    } else if (raw === 'disconnected' || raw === 'close' || raw === 'logged_out') {
      computedStatus = 'DESCONECTADO';
    }

    const updates: any = {
      status: computedStatus,
      lastActivityAt: new Date().toISOString()
    };

    if (computedStatus === 'CONECTADO') {
      updates.connectedAt = new Date().toISOString();
      updates.qrCode = null;
      if (data.phone) updates.connectedPhone = data.phone;
    } else if (computedStatus === 'AGUARDANDO_QR' && data.qr) {
      updates.qrCode = data.qr;
    }

    await this.saveChannelMetadata(organizationId, updates);
  }

  /**
   * Persiste metadados do canal dentro de Organization.metadata sem alterar o schema Prisma
   */
  private static async saveChannelMetadata(organizationId: string, channelUpdates: Partial<WhatsAppChannelInfo>): Promise<void> {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return;

    let currentMeta: any = {};
    if (org.metadata) {
      try { currentMeta = JSON.parse(org.metadata); } catch {}
    }

    currentMeta.whatsappChannel = {
      ...(currentMeta.whatsappChannel || {}),
      ...channelUpdates
    };

    await prisma.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify(currentMeta) }
    });
  }
}
