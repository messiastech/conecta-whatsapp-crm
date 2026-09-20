import { prisma } from '../database/prisma.client.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { MockWhatsAppProvider } from './mock-whatsapp.provider.js';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider.js';
import { GPNWhatsAppProvider } from './gpn-whatsapp.provider.js';
import { CryptoService } from '../security/crypto.service.js';

/**
 * Fábrica de Provedores WhatsApp Multi-Tenant
 * Instancia o provedor com base nas credenciais seguras de cada organização.
 *
 * Prioridade de resolução:
 * 1. GPN Core Gateway (se GpnConnection ativa)
 * 2. Meta Cloud API (se WhatsAppConnection real configurada)
 * 3. Mock Sandbox (fallback)
 */
export class WhatsAppProviderFactory {
  public static async getProviderForOrganization(organizationId: string): Promise<IWhatsAppProvider> {
    // 1. Verifica se a organização tem GPN Core Gateway configurado e ativo
    const gpnConnection = await prisma.gpnConnection.findUnique({
      where: { organizationId }
    });

    if (gpnConnection && gpnConnection.isActive) {
      const apiKey = CryptoService.decrypt(gpnConnection.encryptedApiKey);
      return new GPNWhatsAppProvider({
        apiUrl: gpnConnection.apiUrl,
        apiKey,
        sessionId: gpnConnection.sessionId,
        webhookSecret: gpnConnection.encryptedWebhookSecret
          ? CryptoService.decrypt(gpnConnection.encryptedWebhookSecret)
          : undefined
      });
    }

    // 2. Verifica se a organização tem Meta Cloud API configurada
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

  /**
   * Retorna o tipo de provedor ativo para uma organização.
   * Útil para decidir se aplica regras específicas como a janela de 24h da Meta.
   */
  public static async getProviderType(organizationId: string): Promise<'GPN' | 'META' | 'MOCK'> {
    const gpnConnection = await prisma.gpnConnection.findUnique({
      where: { organizationId }
    });

    if (gpnConnection && gpnConnection.isActive) {
      return 'GPN';
    }

    const connection = await prisma.whatsAppConnection.findUnique({
      where: { organizationId }
    });

    if (!connection || connection.isMock || !connection.phoneNumberId) {
      return 'MOCK';
    }

    return 'META';
  }
}
