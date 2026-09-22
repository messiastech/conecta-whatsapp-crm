import { prisma } from '../database/prisma.client.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from './mock-whatsapp.provider.js';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider.js';
import { GPNWhatsAppProvider } from './gpn-whatsapp.provider.js';
import { CryptoService } from '../security/crypto.service.js';

/**
 * Fábrica de Provedores WhatsApp Multi-Tenant
 * Aplica a Diretriz Definitiva de Mensageria:
 * 1. GPN = PRIMARY & PADRÃO (especialmente no tenant Yeshua Churches).
 * 2. META = Contingência Excepcional (ativada apenas por decisão explícita do admin).
 * 3. MOCK = Somente desenvolvimento/teste local.
 * 4. PROIBIÇÃO DE FALLBACK AUTOMÁTICO GPN → META:
 *    Se o GPN falhar ou estiver indisponível, o sistema reporta erro,
 *    registra alerta operacional e NÃO comuta silenciosamente para a Meta.
 */
export class WhatsAppProviderFactory {
  public static async getProviderForOrganization(organizationId: string): Promise<IWhatsAppProvider> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        gpnConnection: true,
        whatsAppConnection: true
      }
    });

    let verticalProfile = 'DEFAULT';
    let preferredProvider: 'GPN' | 'META' | 'MOCK' = 'GPN';
    let metaContingencyApproved = false;

    if (org?.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
        if (meta.preferredProvider) preferredProvider = meta.preferredProvider;
        if (meta.metaContingencyApproved === true || meta.metaContingency === true) {
          metaContingencyApproved = true;
        }
      } catch {}
    }

    const isAccounting = verticalProfile === 'ACCOUNTING';
    const isProd = process.env.NODE_ENV === 'production';
    const connection = org?.whatsAppConnection;
    const gpn = org?.gpnConnection;

    // 1. META COMO CONTINGÊNCIA EXPLÍCITA
    // Se for ACCOUNTING, a Meta só pode ser instanciada se preferredProvider === 'META'
    // E houver aprovação administrativa deliberada registrada (metaContingencyApproved: true).
    // Caso contrário, falhar sem trocar silenciosamente.
    if (preferredProvider === 'META') {
      if (isAccounting && !metaContingencyApproved) {
        throw new Error(
          '[WHATSAPP_PROD_ERROR] Provedor Meta não autorizado para o perfil ACCOUNTING sem aprovação administrativa deliberada de contingência (metaContingencyApproved).'
        );
      }

      if (connection && !connection.isMock && connection.phoneNumberId) {
        const accessToken = CryptoService.decrypt(connection.encryptedAccessToken || '');
        const appSecret = CryptoService.decrypt(connection.encryptedAppSecret || '');

        return new MetaWhatsAppProvider({
          apiUrl: process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v21.0',
          phoneNumberId: connection.phoneNumberId,
          accessToken,
          appSecret,
          webhookVerifyToken: connection.webhookVerifyToken || 'conecta_webhook_token_secret_2026'
        });
      }

      if (isAccounting || isProd) {
        throw new Error(
          '[WHATSAPP_PROD_ERROR] Provedor de contingência Meta selecionado, mas credenciais da Meta não estão configuradas.'
        );
      }
    }

    // 2. GPN é o Provedor PRINCIPAL e PADRÃO
    if (gpn) {
      if (gpn.isActive && gpn.status !== 'ERROR') {
        const apiKey = CryptoService.decrypt(gpn.encryptedApiKey);
        // Em produção, process.env.GPN_API_URL é a fonte autoritativa da infraestrutura definida pela Mega.
        // Nunca permite que URL antiga armazenada no tenant sobrescreva a URL produtiva.
        const authoritativeApiUrl = (isProd && process.env.GPN_API_URL)
          ? process.env.GPN_API_URL
          : (gpn.apiUrl || process.env.GPN_API_URL || 'http://localhost:3000');

        return new GPNWhatsAppProvider({
          apiUrl: authoritativeApiUrl,
          apiKey,
          sessionId: gpn.sessionId,
          webhookSecret: gpn.encryptedWebhookSecret
            ? CryptoService.decrypt(gpn.encryptedWebhookSecret)
            : undefined
        });
      }

      // Se GPN estiver inativo ou com erro:
      // PROIBIÇÃO ABSOLUTA DE FALLBACK AUTOMÁTICO GPN → META
      await this.reportGpnUnavailableAlert(organizationId, gpn.status);

      if (isAccounting || preferredProvider === 'GPN') {
        throw new Error(
          `[GPN_UNAVAILABLE] O provedor principal GPN está ${gpn.status || 'INDISPONÍVEL'}. ` +
          `Fallback automático para a Meta desativado por diretriz de segurança de mensageria.`
        );
      }
    }

    // 3. MOCK PROIBIDO EM PRODUÇÃO YESHUA
    // Para vertical ACCOUNTING em NODE_ENV=production:
    // Se não houver GPN válido (ou Meta explicitamente autorizada acima), lançar [WHATSAPP_PROD_ERROR].
    // NUNCA retornar MockWhatsAppProvider.
    if (isAccounting && isProd) {
      throw new Error(
        '[WHATSAPP_PROD_ERROR] Nenhum provedor de mensageria GPN válido (ou Meta explicitamente autorizada) configurado para a vertical contábil em produção. Mock é estritamente proibido.'
      );
    }

    // 4. Conexão real com a Meta Cloud API para perfis não-ACCOUNTING
    if (
      !isAccounting &&
      connection &&
      !connection.isMock &&
      connection.phoneNumberId
    ) {
      const accessToken = CryptoService.decrypt(connection.encryptedAccessToken || '');
      const appSecret = CryptoService.decrypt(connection.encryptedAppSecret || '');

      return new MetaWhatsAppProvider({
        apiUrl: process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v21.0',
        phoneNumberId: connection.phoneNumberId,
        accessToken,
        appSecret,
        webhookVerifyToken: connection.webhookVerifyToken || 'conecta_webhook_token_secret_2026'
      });
    }

    // 5. MOCK Sandbox (exclusivo para desenvolvimento ou teste quando não há provedores reais configurados)
    // Para ACCOUNTING em produção, a regra acima já bloqueou terminantemente.
    if (!isProd || connection?.isMock) {
      if (isAccounting && isProd) {
        throw new Error('[WHATSAPP_PROD_ERROR] MockWhatsAppProvider é estritamente proibido para vertical ACCOUNTING em produção.');
      }
      return MockWhatsAppProvider.getInstance();
    }

    throw new Error('[WhatsApp CRM] Nenhum provedor de mensageria ativo configurado para esta organização.');
  }

  /**
   * Retorna o tipo de provedor ativo para uma organização.
   * GPN é o padrão prioritário.
   */
  public static async getProviderType(organizationId: string): Promise<'GPN' | 'META' | 'MOCK'> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { gpnConnection: true, whatsAppConnection: true }
    });

    let verticalProfile = 'DEFAULT';
    let preferredProvider: 'GPN' | 'META' | 'MOCK' | null = null;
    let metaContingencyApproved = false;
    if (org?.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
        if (meta.preferredProvider) preferredProvider = meta.preferredProvider;
        if (meta.metaContingencyApproved === true || meta.metaContingency === true) {
          metaContingencyApproved = true;
        }
      } catch {}
    }

    const isAccounting = verticalProfile === 'ACCOUNTING';

    // Se preferredProvider for META com aprovação explícita em ACCOUNTING ou perfil DEFAULT
    if (preferredProvider === 'META') {
      if (!isAccounting || metaContingencyApproved) {
        if (org?.whatsAppConnection && !org.whatsAppConnection.isMock && org.whatsAppConnection.phoneNumberId) {
          return 'META';
        }
      }
    }

    // 1. GPN Connection ativa tem prioridade máxima
    if (org?.gpnConnection && org.gpnConnection.isActive) {
      return 'GPN';
    }

    // 2. Conexão real com a Meta Cloud API
    if (org?.whatsAppConnection && !org.whatsAppConnection.isMock && org.whatsAppConnection.phoneNumberId) {
      if (isAccounting) {
        if (preferredProvider === 'META' && metaContingencyApproved) {
          return 'META';
        }
        return 'GPN';
      }
      return 'META';
    }

    // 3. Tenant Accounting tem GPN como padrão conceitual de mensageria
    if (isAccounting && (!preferredProvider || preferredProvider === 'GPN')) {
      return 'GPN';
    }

    return 'MOCK';
  }

  /**
   * Registra alerta operacional deduplicado quando o GPN fica indisponível.
   * Não depende da existência de Person:
   * - Registra sempre em AuditLog (action: 'GPN_OPERATIONAL_INCIDENT') e em Organization.metadata.gpnIncident.
   * - Se houver Person, cria também FollowUpTask com prioridade URGENT.
   */
  public static async reportGpnUnavailableAlert(organizationId: string, status: string): Promise<void> {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId }
      });
      if (!org) return;

      let meta: any = {};
      if (org.metadata) {
        try { meta = JSON.parse(org.metadata); } catch {}
      }

      const isAlreadyActive = meta.gpnIncident?.active === true;
      const startedAt = meta.gpnIncident?.startedAt || new Date().toISOString();

      // 1. Atualiza Organization.metadata.gpnIncident se não estiver ativo
      if (!isAlreadyActive) {
        meta.gpnIncident = {
          active: true,
          status,
          startedAt
        };

        await prisma.organization.update({
          where: { id: organizationId },
          data: { metadata: JSON.stringify(meta) }
        });

        // 2. Registra incidente em AuditLog
        await prisma.auditLog.create({
          data: {
            organizationId,
            action: 'GPN_OPERATIONAL_INCIDENT',
            entityType: 'GpnConnection',
            details: JSON.stringify({
              status,
              errorMessage: `A conexão com o GPN Core Gateway está ${status}. O envio de mensagens foi interrompido sem fallback automático para a Meta, conforme diretriz de mensageria.`,
              startedAt
            })
          }
        });
      }

      // 3. Se houver Person, cria também FollowUpTask de prioridade URGENT (deduplicada)
      const firstPerson = await prisma.person.findFirst({ where: { organizationId } });
      if (firstPerson) {
        const existingAlert = await prisma.followUpTask.findFirst({
          where: {
            organizationId,
            title: { contains: 'Alerta Operacional: GPN Indisponível' },
            status: 'PENDING'
          }
        });

        if (!existingAlert) {
          await prisma.followUpTask.create({
            data: {
              organizationId,
              personId: firstPerson.id,
              title: `Alerta Operacional: GPN Indisponível (${status})`,
              description: `A conexão com o GPN Core Gateway está ${status}. O envio de mensagens foi interrompido sem fallback automático para a Meta, conforme diretriz de mensageria.`,
              priority: 'URGENT',
              status: 'PENDING'
            }
          });
        }
      }
    } catch (err: any) {
      console.error('[WhatsAppProviderFactory] Falha ao registrar alerta de indisponibilidade GPN:', err.message);
    }
  }

  /**
   * Resolve incidentes pendentes de indisponibilidade GPN:
   * - Atualiza FollowUpTasks pendentes de indisponibilidade para COMPLETED com completedAt = new Date().
   * - Marca Organization.metadata.gpnIncident = { active: false, resolvedAt }.
   * - Registra no AuditLog: action: 'GPN_INCIDENT_RESOLVED'.
   */
  public static async resolveGpnIncident(organizationId: string): Promise<void> {
    try {
      // 1. Atualiza tarefas pendentes de indisponibilidade
      const pendingTasks = await prisma.followUpTask.findMany({
        where: {
          organizationId,
          title: { contains: 'Alerta Operacional: GPN Indisponível' },
          status: 'PENDING'
        }
      });

      if (pendingTasks.length > 0) {
        await prisma.followUpTask.updateMany({
          where: {
            organizationId,
            title: { contains: 'Alerta Operacional: GPN Indisponível' },
            status: 'PENDING'
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date()
          }
        });
      }

      // 2. Atualiza Organization.metadata.gpnIncident
      const org = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) return;

      let meta: any = {};
      if (org.metadata) {
        try { meta = JSON.parse(org.metadata); } catch {}
      }

      const wasActive = meta.gpnIncident?.active === true || pendingTasks.length > 0;

      if (wasActive || meta.gpnIncident) {
        const resolvedAt = new Date().toISOString();
        meta.gpnIncident = {
          ...(meta.gpnIncident || {}),
          active: false,
          resolvedAt
        };

        await prisma.organization.update({
          where: { id: organizationId },
          data: { metadata: JSON.stringify(meta) }
        });

        // 3. Registra resolução no AuditLog
        if (wasActive) {
          await prisma.auditLog.create({
            data: {
              organizationId,
              action: 'GPN_INCIDENT_RESOLVED',
              entityType: 'GpnConnection',
              details: JSON.stringify({
                resolvedAt,
                message: 'Incidente de indisponibilidade GPN resolvido com sucesso (conexão restabelecida).'
              })
            }
          });
        }
      }
    } catch (err: any) {
      console.error('[WhatsAppProviderFactory] Falha ao resolver incidentes GPN:', err.message);
    }
  }
}
