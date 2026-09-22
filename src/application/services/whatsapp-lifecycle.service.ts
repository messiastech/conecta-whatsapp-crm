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
  provider: 'GPN';
  isOperating: boolean;
  errorMessage?: string | null;
  pendingReplacement?: {
    status: string;
    qrCode?: string | null;
    reason?: string;
    startedAt: string;
  } | null;
}

export class WhatsAppLifecycleService {
  public static getGpnConfig(gpnConnection: any) {
    const isProd = process.env.NODE_ENV === 'production';

    let apiUrl = gpnConnection.apiUrl || process.env.GPN_API_URL;
    if (!apiUrl) {
      if (isProd) {
        throw new Error('[GPN_CONFIG_ERROR] GPN_API_URL não configurada no ambiente de produção.');
      }
      apiUrl = 'http://localhost:3000';
    }

    let apiKey = gpnConnection.encryptedApiKey
      ? CryptoService.decrypt(gpnConnection.encryptedApiKey)
      : process.env.GPN_API_KEY;
    if (!apiKey) {
      if (isProd) {
        throw new Error('[GPN_CONFIG_ERROR] GPN_API_KEY não configurada no ambiente de produção.');
      }
      apiKey = 'gpn_default_key';
    }

    const sessionId = gpnConnection.sessionId || 'default';
    const webhookSecret = gpnConnection.encryptedWebhookSecret
      ? CryptoService.decrypt(gpnConnection.encryptedWebhookSecret)
      : process.env.GPN_WEBHOOK_SECRET;

    if (isProd && (!webhookSecret || webhookSecret.length < 16)) {
      throw new Error('[GPN_CONFIG_ERROR] GPN_WEBHOOK_SECRET ausente ou menor que 16 caracteres em produção.');
    }

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
    let pendingReplacement: any = null;
    if (org.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.whatsappChannel) {
          channelData = meta.whatsappChannel;
        }
        if (meta.pendingWhatsAppReplacement) {
          pendingReplacement = meta.pendingWhatsAppReplacement;
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
      provider: 'GPN',
      isOperating: computedStatus === 'CONECTADO',
      errorMessage: channelData.errorMessage || null,
      pendingReplacement: pendingReplacement
        ? {
            status: pendingReplacement.status,
            qrCode: pendingReplacement.qrCode || null,
            reason: pendingReplacement.reason,
            startedAt: pendingReplacement.startedAt
          }
        : null
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
      const isProd = process.env.NODE_ENV === 'production';
      const apiUrl = process.env.GPN_API_URL || (isProd ? '' : 'http://localhost:3000');
      const defaultApiKey = process.env.GPN_API_KEY || (isProd ? '' : 'gpn_auto_provisioned_key');
      const defaultWebhookSecret = process.env.GPN_WEBHOOK_SECRET || (isProd ? '' : crypto.randomBytes(24).toString('hex'));

      if (isProd) {
        if (!apiUrl || (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://'))) {
          throw new Error('[GPN_CONFIG_ERROR] GPN_API_URL ausente ou inválida em ambiente de produção.');
        }
        if (!defaultApiKey) {
          throw new Error('[GPN_CONFIG_ERROR] GPN_API_KEY ausente em ambiente de produção.');
        }
        if (!defaultWebhookSecret || defaultWebhookSecret.length < 16) {
          throw new Error('[GPN_CONFIG_ERROR] GPN_WEBHOOK_SECRET ausente ou com menos de 16 caracteres em produção.');
        }
      }

      gpnConn = await prisma.gpnConnection.create({
        data: {
          organizationId,
          apiUrl,
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

    const status: WhatsAppChannelStatus = sessionRes.status === 'CONNECTED' ? 'CONECTADO' : 'AGUARDANDO_QR';

    // Se o status exigir QR e o GPN não fornecer QR real, falhar lançando [GPN_UNAVAILABLE]
    if (status === 'AGUARDANDO_QR' && !sessionRes.qr) {
      throw new Error('[GPN_UNAVAILABLE] GPN Core Gateway não forneceu QR Code real para pareamento.');
    }

    const qrCode = status === 'AGUARDANDO_QR' ? sessionRes.qr : null;

    // Salva metadados do canal no metadata da organização
    await this.saveChannelMetadata(organizationId, {
      status,
      sessionId,
      qrCode,
      connectedAt: status === 'CONECTADO' ? new Date().toISOString() : null,
      lastActivityAt: new Date().toISOString()
    });

    return {
      status,
      connectedPhone: sessionRes.phone || null,
      connectedAt: status === 'CONECTADO' ? new Date().toISOString() : null,
      lastActivityAt: new Date().toISOString(),
      qrCode,
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
   * Substituição de número de WhatsApp em Duas Fases (Two-Phase Replacement):
   * 1. A sessão atual (CURRENT_SESSION) permanece ATIVA e operacional.
   * 2. Cria PENDING_SESSION em staging dentro de Organization.metadata.pendingWhatsAppReplacement.
   * 3. Inicia nova sessão no GPN Core Gateway para obter o novo QR Code.
   * 4. Registra auditoria oficial da solicitação de substituição.
   * 5. Retorna o novo QR Code para o usuário parear o novo aparelho.
   */
  public static async replaceNumber(
    organizationId: string,
    userId: string,
    reason?: string
  ): Promise<WhatsAppChannelInfo> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });

    if (!org) {
      throw new Error('Organização não encontrada');
    }

    let gpnConn = org.gpnConnection;
    if (!gpnConn) {
      const isProd = process.env.NODE_ENV === 'production';
      const apiUrl = process.env.GPN_API_URL || (isProd ? '' : 'http://localhost:3000');
      const defaultApiKey = process.env.GPN_API_KEY || (isProd ? '' : 'gpn_auto_provisioned_key');
      const defaultWebhookSecret = process.env.GPN_WEBHOOK_SECRET || (isProd ? '' : crypto.randomBytes(24).toString('hex'));

      if (isProd) {
        if (!apiUrl || (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://'))) {
          throw new Error('[GPN_CONFIG_ERROR] GPN_API_URL ausente ou inválida em produção.');
        }
        if (!defaultApiKey) {
          throw new Error('[GPN_CONFIG_ERROR] GPN_API_KEY ausente em produção.');
        }
        if (!defaultWebhookSecret || defaultWebhookSecret.length < 16) {
          throw new Error('[GPN_CONFIG_ERROR] GPN_WEBHOOK_SECRET ausente ou menor que 16 caracteres em produção.');
        }
      }

      gpnConn = await prisma.gpnConnection.create({
        data: {
          organizationId,
          apiUrl,
          sessionId: `org-${org.slug || organizationId}`,
          encryptedApiKey: CryptoService.encrypt(defaultApiKey),
          encryptedWebhookSecret: CryptoService.encrypt(defaultWebhookSecret),
          isActive: true,
          status: 'DISCONNECTED'
        }
      });
    }

    const previousSessionId = gpnConn.sessionId;
    const currentStatus = await this.getStatus(organizationId);
    const previousPhone = currentStatus.connectedPhone || 'Nenhum';

    const newSessionId = `org-replace-${Date.now()}`;
    const startedAt = new Date().toISOString();

    // Inicia nova sessão no GPN Gateway em staging (sem alterar gpnConnection)
    const gpnConfig = this.getGpnConfig(gpnConn);
    const provider = new GPNWhatsAppProvider({
      ...gpnConfig,
      sessionId: newSessionId
    });

    const sessionRes = await provider.startSession(newSessionId);
    if (!sessionRes.qr) {
      throw new Error('[GPN_UNAVAILABLE] GPN Core Gateway não forneceu QR Code para a substituição.');
    }
    const qrCode = sessionRes.qr;

    const pendingData = {
      previousSessionId,
      newSessionId,
      status: 'AGUARDANDO_QR',
      qrCode,
      reason: reason || 'Substituição operacional solicitada pelo usuário',
      startedAt,
      userId
    };

    // Salva PENDING_SESSION em staging dentro de Organization.metadata
    let currentMeta: any = {};
    if (org.metadata) {
      try { currentMeta = JSON.parse(org.metadata); } catch {}
    }
    currentMeta.pendingWhatsAppReplacement = pendingData;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { metadata: JSON.stringify(currentMeta) }
    });

    // Registra Auditoria Oficial da solicitação
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'WHATSAPP_NUMBER_REPLACED',
        entityType: 'WhatsAppChannel',
        entityId: newSessionId,
        details: JSON.stringify({
          previousNumber: previousPhone,
          previousSessionId,
          newSessionId,
          reason: reason || 'Substituição operacional solicitada pelo usuário',
          date: startedAt,
          preservedEntities: ['persons', 'conversations', 'messages', 'followUpTasks', 'aiAnalyses']
        })
      }
    });

    return {
      status: 'AGUARDANDO_QR',
      connectedPhone: currentStatus.connectedPhone || null,
      connectedAt: currentStatus.connectedAt || null,
      lastActivityAt: startedAt,
      qrCode,
      provider: 'GPN',
      isOperating: currentStatus.isOperating,
      pendingReplacement: {
        status: pendingData.status,
        qrCode: pendingData.qrCode || null,
        reason: pendingData.reason,
        startedAt: pendingData.startedAt
      }
    };
  }

  /**
   * Cancela a substituição de número pendente:
   * - Encerra a sessão de staging no GPN se existir.
   * - Registra log de auditoria do cancelamento.
   * - Limpa o staging em Organization.metadata.pendingWhatsAppReplacement.
   * - A sessão anterior permanece 100% intacta e operacional.
   */
  public static async cancelReplaceNumber(
    organizationId: string,
    userId?: string,
    reason?: string
  ): Promise<WhatsAppChannelInfo> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true }
    });

    if (!org) throw new Error('Organização não encontrada');

    let meta: any = {};
    if (org.metadata) {
      try { meta = JSON.parse(org.metadata); } catch {}
    }

    const pending = meta.pendingWhatsAppReplacement;
    if (pending) {
      if (org.gpnConnection && pending.newSessionId) {
        try {
          const gpnConfig = this.getGpnConfig(org.gpnConnection);
          const provider = new GPNWhatsAppProvider({
            ...gpnConfig,
            sessionId: pending.newSessionId
          });
          await provider.deleteSession(pending.newSessionId).catch(() => {});
        } catch {}
      }

      await prisma.auditLog.create({
        data: {
          organizationId,
          userId: userId || null,
          action: 'WHATSAPP_NUMBER_REPLACE_CANCELLED',
          entityType: 'WhatsAppChannel',
          entityId: pending.newSessionId,
          details: JSON.stringify({
            previousSessionId: pending.previousSessionId,
            cancelledSessionId: pending.newSessionId,
            reason: reason || 'Cancelamento solicitado pelo usuário ou falha na sessão',
            cancelledAt: new Date().toISOString()
          })
        }
      });

      delete meta.pendingWhatsAppReplacement;
      await prisma.organization.update({
        where: { id: organizationId },
        data: { metadata: JSON.stringify(meta) }
      });
    }

    return this.getStatus(organizationId);
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
    data: { status: string; phone?: string; qr?: string; sessionId?: string }
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
      if (data.sessionId) updates.sessionId = data.sessionId;
    } else if (computedStatus === 'AGUARDANDO_QR' && data.qr) {
      updates.qrCode = data.qr;
    }

    await this.saveChannelMetadata(organizationId, updates);
  }

  /**
   * Resolve incidentes operacionais pendentes do GPN ao restabelecer conexão
   */
  public static async resolveGpnIncident(organizationId: string): Promise<void> {
    const { WhatsAppProviderFactory } = await import('../../infrastructure/whatsapp/whatsapp-provider.factory.js');
    await WhatsAppProviderFactory.resolveGpnIncident(organizationId);
  }

  /**
   * Persiste metadados do canal dentro de Organization.metadata sem alterar o schema Prisma
   */
  private static async saveChannelMetadata(
    organizationId: string,
    channelUpdates: Partial<WhatsAppChannelInfo> & { sessionId?: string }
  ): Promise<void> {
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
