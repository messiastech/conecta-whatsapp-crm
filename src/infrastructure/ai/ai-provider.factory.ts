import { prisma } from '../database/prisma.client.js';
import { CryptoService } from '../security/crypto.service.js';
import { IAIProvider, AIHealthCheckResult } from '../../domain/ports/ai-provider.port.js';
import { GeminiAIProvider } from './gemini-ai.provider.js';
import { DeepSeekAIProvider } from './deepseek-ai.provider.js';

export type SupportedAIProvider = 'GEMINI' | 'DEEPSEEK';

/**
 * AIProviderFactory (AIRouter Tenant-Aware)
 * 
 * Responsabilidades Arquiteturais:
 * 1. Resolução dinâmica do provedor de IA com base nas configurações da organização (OrganizationSettings).
 * 2. Suporte aos provedores GEMINI (padrão) e DEEPSEEK.
 * 3. Gestão segura de chaves criptografadas (AES-256-GCM via CryptoService) ou variáveis de ambiente.
 * 4. Proteção do Tenant Yeshua: DeepSeek NUNCA é ativado por padrão para o tenant Yeshua.
 * 5. REGRA ESTRITA DE FALLBACK:
 *    Se o provedor configurado falhar ou estiver sem credenciais válidas,
 *    NUNCA trocar silenciosamente para outro fornecedor externo concorrente!
 */
export class AIProviderFactory {
  /**
   * Obtém a instância de IAIProvider configurada para a organização informada.
   */
  public static async getProviderForOrganization(organizationId: string): Promise<IAIProvider> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        settings: true
      }
    });

    if (!org) {
      throw new Error(`[AI_PROVIDER_ERROR] Organização "${organizationId}" não encontrada no sistema.`);
    }

    let verticalProfile = 'DEFAULT';
    if (org.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
      } catch {}
    }

    const isYeshuaTenant =
      verticalProfile === 'ACCOUNTING' ||
      org.name?.toLowerCase().includes('yeshua') ||
      org.slug?.toLowerCase().includes('yeshua');

    const settings = org.settings;

    // Resolução do provedor:
    // Padrão do sistema é SEMPRE 'GEMINI'
    // Para o tenant Yeshua, reforça-se que DEEPSEEK só é ativado se houver configuração explícita e intencional no banco.
    let targetProvider: SupportedAIProvider = 'GEMINI';

    if (settings?.aiProvider) {
      const normalized = settings.aiProvider.trim().toUpperCase();
      if (normalized === 'DEEPSEEK') {
        targetProvider = 'DEEPSEEK';
      } else if (normalized === 'GEMINI') {
        targetProvider = 'GEMINI';
      } else {
        throw new Error(
          `[AI_PROVIDER_ERROR] Provedor de IA configurado "${settings.aiProvider}" não é suportado. ` +
          `Provedores válidos são: GEMINI, DEEPSEEK.`
        );
      }
    }

    // Salvaguarda: No tenant Yeshua, se não houver configuração explícita de DEEPSEEK, garante GEMINI
    if (isYeshuaTenant && targetProvider !== 'DEEPSEEK') {
      targetProvider = 'GEMINI';
    }

    // ==========================================
    // INSTANCIAÇÃO: GEMINI
    // ==========================================
    if (targetProvider === 'GEMINI') {
      let apiKey = '';
      if (settings?.encryptedGeminiKey) {
        apiKey = CryptoService.decrypt(settings.encryptedGeminiKey);
      }
      if (!apiKey && process.env.GEMINI_API_KEY) {
        apiKey = process.env.GEMINI_API_KEY;
      }

      if (!apiKey || apiKey.trim().length === 0) {
        // REGRA ESTRITA DE FALLBACK: NUNCA chavear silenciosamente para DeepSeek!
        throw new Error(
          `[AI_PROVIDER_ERROR] O provedor GEMINI está selecionado para a organização "${org.name}" (${organizationId}), ` +
          `mas nenhuma chave de API válida foi encontrada (nem no banco nem na variável GEMINI_API_KEY). ` +
          `Fallback silencioso para outros provedores é terminantemente proibido.`
        );
      }

      const modelName = settings?.aiModel || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      return new GeminiAIProvider(apiKey, modelName);
    }

    // ==========================================
    // INSTANCIAÇÃO: DEEPSEEK
    // ==========================================
    if (targetProvider === 'DEEPSEEK') {
      let apiKey = '';
      if (settings?.encryptedDeepSeekKey) {
        apiKey = CryptoService.decrypt(settings.encryptedDeepSeekKey);
      }
      if (!apiKey && process.env.DEEPSEEK_API_KEY) {
        apiKey = process.env.DEEPSEEK_API_KEY;
      }

      if (!apiKey || apiKey.trim().length === 0) {
        // REGRA ESTRITA DE FALLBACK: NUNCA chavear silenciosamente para Gemini!
        throw new Error(
          `[AI_PROVIDER_ERROR] O provedor DEEPSEEK está selecionado para a organização "${org.name}" (${organizationId}), ` +
          `mas nenhuma chave de API válida foi encontrada (nem no banco nem na variável DEEPSEEK_API_KEY). ` +
          `Fallback silencioso para outros provedores é terminantemente proibido.`
        );
      }

      const modelName = settings?.aiModel || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
      const apiUrl = process.env.DEEPSEEK_API_URL;
      return new DeepSeekAIProvider(apiKey, modelName, apiUrl);
    }

    throw new Error(`[AI_PROVIDER_ERROR] Estado inconsistente na seleção de provedor de IA.`);
  }

  /**
   * Identifica o nome do provedor ativo para a organização sem instanciar credenciais.
   */
  public static async getProviderNameForOrganization(organizationId: string): Promise<SupportedAIProvider> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { settings: true }
    });

    if (!org) {
      throw new Error(`[AI_PROVIDER_ERROR] Organização "${organizationId}" não encontrada.`);
    }

    let verticalProfile = 'DEFAULT';
    if (org.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
      } catch {}
    }

    const isYeshuaTenant =
      verticalProfile === 'ACCOUNTING' ||
      org.name?.toLowerCase().includes('yeshua') ||
      org.slug?.toLowerCase().includes('yeshua');

    if (org.settings?.aiProvider?.trim().toUpperCase() === 'DEEPSEEK') {
      return 'DEEPSEEK';
    }

    // Default universal (especialmente Yeshua)
    return 'GEMINI';
  }

  /**
   * Executa teste de conectividade (healthcheck) do provedor ativo para a organização.
   */
  public static async checkHealthForOrganization(organizationId: string): Promise<AIHealthCheckResult & { provider: SupportedAIProvider }> {
    const provider = await this.getProviderForOrganization(organizationId);
    const health = await provider.healthCheck();
    return {
      ...health,
      provider: provider.providerName as SupportedAIProvider
    };
  }
}
