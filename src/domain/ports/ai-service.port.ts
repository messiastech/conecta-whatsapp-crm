import { AbsenceAnalysis } from '../value-objects/absence-taxonomy.vo.js';

export interface AIClassificationContext {
  personName: string;
  eventName: string;
  eventDate?: string;
  previousAttendances?: number;
  outboundMessageText?: string;
}

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
}
