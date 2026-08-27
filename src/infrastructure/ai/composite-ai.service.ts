import { IAIService, AIClassificationContext } from '../../domain/ports/ai-service.port.js';
import { AbsenceAnalysis } from '../../domain/value-objects/absence-taxonomy.vo.js';
import { GeminiAIProvider } from './gemini-ai.provider.js';
import { RuleBasedFallbackProvider } from './rule-based-fallback.provider.js';

export class CompositeAIService implements IAIService {
  private fallbackProvider: RuleBasedFallbackProvider;
  private geminiProvider: GeminiAIProvider | null = null;

  constructor() {
    this.fallbackProvider = new RuleBasedFallbackProvider();

    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    if (geminiKey && geminiKey.trim().length > 5) {
      this.geminiProvider = new GeminiAIProvider(geminiKey.trim(), geminiModel);
    }
  }

  async classifyAbsence(
    messageText: string,
    context: AIClassificationContext
  ): Promise<AbsenceAnalysis & { providerUsed: string }> {
    // 1. Tenta Provedor Primário (Gemini) se houver chave configurada
    if (this.geminiProvider) {
      try {
        const result = await this.geminiProvider.classifyAbsence(messageText, context);
        return result;
      } catch (err: any) {
        console.warn(`[AI Service] Aviso: Falha na chamada da API Gemini (${err.message}). Acionando Fallback Heurístico Local.`);
      }
    }

    // 2. Aciona Fallback Local Heurístico (Resiliência 100% offline)
    return this.fallbackProvider.classifyAbsence(messageText, context);
  }

  async generateSuggestedReply(
    messageText: string,
    context: AIClassificationContext,
    category: string
  ): Promise<{ suggestedReply: string; providerUsed: string }> {
    if (this.geminiProvider) {
      try {
        return await this.geminiProvider.generateSuggestedReply(messageText, context, category);
      } catch (err: any) {
        console.warn(`[AI Service] Aviso: Falha na geração de resposta Gemini. Acionando Fallback Local.`);
      }
    }

    return this.fallbackProvider.generateSuggestedReply(messageText, context, category);
  }
}
