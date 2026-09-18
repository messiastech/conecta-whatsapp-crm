import { prisma } from '../database/prisma.client.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from './mock-whatsapp.provider.js';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider.js';
import { CryptoService } from '../security/crypto.service.js';

/**
 * Fábrica de Provedores WhatsApp Multi-Tenant
 * Instancia o provedor com base nas credenciais seguras de cada organização.
 */
export class WhatsAppProviderFactory {
  public static async getProviderForOrganization(organizationId: string): Promise<IWhatsAppProvider> {
    const connection = await prisma.whatsAppConnection.findUnique({
      where: { organizationId }
    });

    // Se a organização não configurou WhatsApp ou marcou modo Mock/Sandbox
    if (!connection || connection.isMock || !connection.phoneNumberId) {
      return MockWhatsAppProvider.getInstance();
    }

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
}
