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
    if (org?.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
        if (meta.preferredProvider) preferredProvider = meta.preferredProvider;
      } catch {}
    }

    const isAccounting = verticalProfile === 'ACCOUNTING';

    // 1. GPN é o Provedor PRINCIPAL e PADRÃO
    const gpn = org?.gpnConnection;
    if (gpn) {
      if (gpn.isActive && gpn.status !== 'ERROR') {
        const apiKey = CryptoService.decrypt(gpn.encryptedApiKey);
        return new GPNWhatsAppProvider({
          apiUrl: gpn.apiUrl,
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

    // 2. META é provedor de CONTINGÊNCIA EXCEPCIONAL (somente por decisão explícita)
    const connection = org?.whatsAppConnection;
    if (
      connection &&
      !connection.isMock &&
      connection.phoneNumberId &&
      preferredProvider === 'META' &&
      !isAccounting
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

    // 3. MOCK Sandbox (exclusivo para desenvolvimento ou teste quando não há provedores reais configurados)
    if (process.env.NODE_ENV !== 'production' || connection?.isMock) {
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
    if (org?.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
        if (meta.preferredProvider) preferredProvider = meta.preferredProvider;
      } catch {}
    }

    const isAccounting = verticalProfile === 'ACCOUNTING';

    // 1. GPN Connection ativa tem prioridade máxima
    if (org?.gpnConnection && org.gpnConnection.isActive) {
      return 'GPN';
    }

    // 2. Conexão real com a Meta Cloud API
    if (org?.whatsAppConnection && !org.whatsAppConnection.isMock && org.whatsAppConnection.phoneNumberId) {
      if (isAccounting && preferredProvider !== 'META') {
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
   * Registra alerta operacional deduplicado quando o GPN fica indisponível
   */
  private static async reportGpnUnavailableAlert(organizationId: string, status: string): Promise<void> {
    try {
      const existingAlert = await prisma.followUpTask.findFirst({
        where: {
          organizationId,
          title: { contains: 'Alerta Operacional: GPN Indisponível' },
          status: 'PENDING'
        }
      });

      if (!existingAlert) {
        const firstPerson = await prisma.person.findFirst({ where: { organizationId } });
        if (firstPerson) {
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
}
