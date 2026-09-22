import { AbsenceAnalysis } from '../value-objects/absence-taxonomy.vo.js';
import {
  AIClassificationContext,
  GenerateAccountingReplyParams,
  AccountingAIReplyResult,
  AITokensUsed,
  AIHealthCheckResult,
  MemoryMessageItem,
  IAIProvider,
  AICapabilities,
  AttachmentInputDTO
} from './ai-provider.port.js';

export type {
  AIClassificationContext,
  GenerateAccountingReplyParams,
  AccountingAIReplyResult,
  AITokensUsed,
  AIHealthCheckResult,
  MemoryMessageItem,
  IAIProvider,
  AICapabilities,
  AttachmentInputDTO
};

export interface IAIService {
  /**
   * Classifica a mensagem recebida de ausência em formato estruturado (JSON Schema)
   */
  classifyAbsence(
    messageText: string,
    context: AIClassificationContext
  ): Promise<AbsenceAnalysis & { providerUsed: string }>;

  /**
   * Gera uma sugestão de resposta humanizada, respeitosa e contextualizada
   */
  generateSuggestedReply(
    messageText: string,
    context: AIClassificationContext,
    category: string
  ): Promise<{ suggestedReply: string; providerUsed: string }>;

  /**
   * Atendimento Inteligente Yeshua (AI Autopilot Contábil e Eclesiástico)
   * Gera resposta com memória conversacional e safety gate estruturado
   */
  generateAccountingReply?(
    params: GenerateAccountingReplyParams
  ): Promise<AccountingAIReplyResult>;
}
