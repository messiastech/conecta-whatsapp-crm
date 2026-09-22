export interface AIClassificationContext {
  personName: string;
  eventName: string;
  eventDate?: string;
  previousAttendances?: number;
  outboundMessageText?: string;
}

export type AttachmentTypeEnum = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'PDF' | 'OTHER';

export interface AttachmentInputDTO {
  id?: string;
  type: AttachmentTypeEnum;
  mimeType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
  providerMediaId?: string | null;
  storageKey?: string | null;
  sha256?: string | null;
  url?: string | null;
  base64Data?: string | null;
  caption?: string | null;
  durationSeconds?: number | null;
  transcript?: string | null;
  extractedText?: string | null;
  aiSummary?: string | null;
  metadataJson?: Record<string, any> | null;
}

export interface AICapabilities {
  readonly supportsText: boolean;
  readonly supportsImages: boolean;
  readonly supportsAudio: boolean;
  readonly supportsVideo: boolean;
  readonly supportsDocuments: boolean;
  readonly maxInlineFileSizeBytes?: number;
}

export interface GenerateAccountingReplyParams {
  organization: {
    id: string;
    name: string;
    vertical?: string;
  };
  person: {
    id: string;
    name: string;
    normalizedPhone: string;
    notes?: string | null;
  };
  memory: {
    summary: string;
    facts: Record<string, any>;
    openItems: any[];
    preferences: Record<string, any>;
  };
  recentMessages: Array<{
    sender: 'INBOUND' | 'OUTBOUND';
    text: string;
    createdAt: Date;
    attachmentsSummary?: string;
  }>;
  inboundMessage: {
    id: string;
    text: string;
    receivedAt: Date;
    attachments?: AttachmentInputDTO[];
  };
  riskClassification?: {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    isEscalation: boolean;
    reason?: string;
  };
}

export interface AITokensUsed {
  promptTokens?: number;
  candidateTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

export interface AccountingAIReplyResult {
  reply: string;
  confidence: number;
  intent: string;
  category: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  decision: 'AUTO_REPLY' | 'HUMAN_ESCALATION' | 'DO_NOT_REPLY';
  missingInformation: string[];
  memoryUpdates: {
    facts?: Record<string, any>;
    openItems?: any[];
    preferences?: Record<string, any>;
    summary?: string;
  };
  providerUsed: string;
  modelUsed?: string;
  latencyMs?: number;
  tokensUsed?: AITokensUsed;
  mediaProcessed?: boolean;
}

export interface MemoryMessageItem {
  sender: 'INBOUND' | 'OUTBOUND';
  text: string;
  attachmentsSummary?: string;
}

export interface AIHealthCheckResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Porta de Provedor de IA Multi-Modelo e Multimodal (Hexagonal Architecture)
 * Suporta Gemini (multimodal nativo), DeepSeek (texto puro ou orquestrado) e outros provedores compatíveis.
 */
export interface IAIProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly capabilities: AICapabilities;

  /**
   * Atendimento Inteligente Autopilot (Contábil / Eclesiástico)
   * Processa texto e mídias multimodais com guardrails, memória contextual e análise de risco.
   */
  generateAccountingReply(params: GenerateAccountingReplyParams): Promise<AccountingAIReplyResult>;

  /**
   * Sumarização compacta e contínua (rolling summary) de contexto conversacional.
   */
  summarizeMemory(previousSummary: string, newMessages: MemoryMessageItem[]): Promise<string>;

  /**
   * Verificação de conectividade e integridade do modelo.
   */
  healthCheck(): Promise<AIHealthCheckResult>;

  /**
   * Extração cognitiva e OCR/transcrição especializada de mídia
   */
  extractMediaContent?(attachment: AttachmentInputDTO): Promise<{
    extractedText: string;
    summary: string;
    detectedCategory?: string;
    riskAlert?: string;
    factsExtracted?: Record<string, any>;
  }>;
}
