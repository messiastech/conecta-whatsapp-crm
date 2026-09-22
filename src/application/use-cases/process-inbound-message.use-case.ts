import { prisma } from '../../infrastructure/database/prisma.client.js';
import { IAIService, AccountingAIReplyResult } from '../../domain/ports/ai-service.port.js';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';
import { AccountingAIPolicy } from '../verticals/accounting/accounting-ai-policy.js';
import { ConversationMemoryService } from '../services/conversation-memory.service.js';
import { WhatsAppProviderFactory } from '../../infrastructure/whatsapp/whatsapp-provider.factory.js';
import {
  MediaIngestionService,
  RawMediaItem,
  ProcessedAttachmentResult
} from '../services/media-ingestion.service.js';

export interface ProcessInboundMessageDTO {
  organizationId: string;
  fromPhone: string;
  senderName?: string;
  text?: string;
  media?: RawMediaItem[];
  providerMessageId?: string;
  rawPayload?: any;
}

export interface ProcessInboundMessageResult {
  messageId: string;
  personId: string;
  personName: string;
  conversationId: string;
  isOptOut: boolean;
  attachments?: ProcessedAttachmentResult[];
  classification?: {
    category: string;
    intent: string;
    confidence: number;
    sentiment: string;
    urgency: string;
    priority: string;
    summary: string;
    requiresHumanAttention: boolean;
    suggestedReply?: string;
    nextAction: string;
    providerUsed: string;
  };
  followUpTaskId?: string;
  autoReplySent?: boolean;
  outboundMessageId?: string;
  autopilotDecision?: 'AUTO_REPLY' | 'HUMAN_ESCALATION' | 'DO_NOT_REPLY';
  memoryContext?: any;
}

export class ProcessInboundMessageUseCase {
  constructor(private aiService: IAIService) {}

  async execute(dto: ProcessInboundMessageDTO): Promise<ProcessInboundMessageResult> {
    // Proteção contra loops: ignora mensagens originadas pelo próprio número/sistema
    if (dto.rawPayload?.fromMe || dto.rawPayload?.key?.fromMe) {
      return {
        messageId: '',
        personId: '',
        personName: '',
        conversationId: '',
        isOptOut: false,
        autoReplySent: false
      };
    }

    const hasText = Boolean(dto.text && dto.text.trim().length > 0);
    const hasMedia = Boolean(dto.media && dto.media.length > 0);
    if (!hasText && !hasMedia) {
      return {
        messageId: '',
        personId: '',
        personName: '',
        conversationId: '',
        isOptOut: false,
        autoReplySent: false
      };
    }

    const normalizedResult = PhoneNumber.normalize(dto.fromPhone);
    const normalizedPhone = normalizedResult.normalizedPhone || dto.fromPhone;

    // 0. Verificação de Idempotência (Meta Webhook Redelivery / Retries)
    if (dto.providerMessageId) {
      const existingMessage = await prisma.message.findUnique({
        where: { providerMessageId: dto.providerMessageId },
        include: {
          person: true,
          aiAnalyses: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (existingMessage) {
        const latestAnalysis = existingMessage.aiAnalyses[0];
        return {
          messageId: existingMessage.id,
          personId: existingMessage.personId,
          personName: existingMessage.person.name,
          conversationId: existingMessage.conversationId,
          isOptOut: existingMessage.person.optOut,
          classification: latestAnalysis ? {
            category: latestAnalysis.category,
            intent: latestAnalysis.intent,
            confidence: latestAnalysis.confidence,
            sentiment: latestAnalysis.sentiment,
            urgency: latestAnalysis.urgency,
            priority: latestAnalysis.priority,
            summary: latestAnalysis.summary,
            requiresHumanAttention: latestAnalysis.requiresHumanAttention,
            suggestedReply: latestAnalysis.suggestedReply || undefined,
            nextAction: latestAnalysis.nextAction,
            providerUsed: latestAnalysis.modelUsed
          } : undefined
        };
      }
    }

    // 1. Localiza ou cria a Pessoa isolada por Tenant
    let person = await prisma.person.findUnique({
      where: {
        organizationId_normalizedPhone: {
          organizationId: dto.organizationId,
          normalizedPhone
        }
      }
    });

    if (!person) {
      person = await prisma.person.create({
        data: {
          organizationId: dto.organizationId,
          name: dto.senderName || 'Participante (WhatsApp)',
          phone: dto.fromPhone,
          normalizedPhone,
          optOut: false,
          consentStatus: 'OPTED_IN',
          consentSource: 'INBOUND_MESSAGE'
        }
      });
    } else if (dto.senderName && person.name === 'Participante (WhatsApp)') {
      person = await prisma.person.update({
        where: { id: person.id },
        data: { name: dto.senderName }
      });
    }

    // 2. Garante a conversa isolada por Tenant
    let conversation = await prisma.conversation.findFirst({
      where: {
        personId: person.id,
        organizationId: dto.organizationId
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId: dto.organizationId,
          personId: person.id,
          status: 'OPEN',
          priority: 'MEDIUM',
          requiresHumanAttention: false
        }
      });
    }

    // 3. Salva a mensagem recebida no banco com organizationId
    const rawText = (dto.text || '').trim();
    let initialContent = rawText;
    if (!initialContent && hasMedia) {
      const first = dto.media![0];
      initialContent = first.caption || `[Anexo ${first.type || 'Mídia'}: ${first.fileName || first.mimeType}]`;
    }

    let inboundMessage;
    try {
      inboundMessage = await prisma.message.create({
        data: {
          organizationId: dto.organizationId,
          conversationId: conversation.id,
          personId: person.id,
          direction: 'INBOUND',
          providerMessageId: dto.providerMessageId || null,
          content: initialContent,
          hasAttachments: hasMedia,
          status: 'READ',
          deliveredAt: new Date(),
          readAt: new Date()
        }
      });
    } catch (err: any) {
      // Se ocorrer colisão de chave única em caso de race condition no webhook retry
      if (err?.code === 'P2002' && dto.providerMessageId) {
        const retryFound = await prisma.message.findUnique({
          where: { providerMessageId: dto.providerMessageId },
          include: {
            person: true,
            attachments: true,
            aiAnalyses: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        });
        if (retryFound) {
          const latestAnalysis = retryFound.aiAnalyses[0];
          return {
            messageId: retryFound.id,
            personId: retryFound.personId,
            personName: retryFound.person.name,
            conversationId: retryFound.conversationId,
            isOptOut: retryFound.person.optOut,
            attachments: retryFound.attachments as any,
            classification: latestAnalysis
              ? {
                  category: latestAnalysis.category,
                  intent: latestAnalysis.intent,
                  confidence: latestAnalysis.confidence,
                  sentiment: latestAnalysis.sentiment,
                  urgency: latestAnalysis.urgency,
                  priority: latestAnalysis.priority,
                  summary: latestAnalysis.summary,
                  requiresHumanAttention: latestAnalysis.requiresHumanAttention,
                  suggestedReply: latestAnalysis.suggestedReply || undefined,
                  nextAction: latestAnalysis.nextAction,
                  providerUsed: latestAnalysis.modelUsed
                }
              : undefined
          };
        }
      }
      throw err;
    }

    // Ingestão e Processamento Seguro de Mídias (Tenant-Isolated, sem blobs no Neon)
    let processedAttachments: ProcessedAttachmentResult[] = [];
    if (hasMedia) {
      processedAttachments = await MediaIngestionService.ingestMediaList(dto.media!, {
        organizationId: dto.organizationId,
        messageId: inboundMessage.id,
        aiProvider: this.aiService
      });
    }

    // Monta o texto consolidado com texto principal e conteúdo extraído de mídias
    const mediaSummaries = processedAttachments.map(att => {
      const parts: string[] = [];
      if (att.caption) parts.push(`Legenda: "${att.caption}"`);
      if (att.transcript) parts.push(`Transcrição do Áudio: "${att.transcript}"`);
      if (att.extractedText) parts.push(`Conteúdo do Documento: "${att.extractedText}"`);
      if (att.aiSummary) parts.push(`Resumo da Mídia: "${att.aiSummary}"`);
      return parts.join(' | ');
    }).filter(Boolean);

    const consolidatedText = [rawText, ...mediaSummaries].filter(Boolean).join('\n\n') || initialContent;

    // 4. Verificação de Opt-Out Imediato (LGPD / Meta Compliance)
    const optOutRegex = /^(stop|sair|parar|cancelar|descadastrar|remover|n(a|ã)o\s*quero\s*mais|n(a|ã)o\s*mandem\s*mais)$/i;
    const isOptOut = rawText ? optOutRegex.test(rawText) : false;

    if (isOptOut) {
      await prisma.person.update({
        where: { id: person.id },
        data: {
          optOut: true,
          consentStatus: 'OPTED_OUT',
          optOutReason: 'Solicitação de cancelamento recebida via mensagem de WhatsApp',
          optOutAt: new Date()
        }
      });

      // Registra no histórico formal de consentimento com organizationId
      await prisma.consentHistory.create({
        data: {
          organizationId: dto.organizationId,
          personId: person.id,
          status: 'OPTED_OUT',
          reason: `Comando de opt-out: "${dto.text}"`,
          source: 'WEBHOOK_KEYWORD'
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'CLOSED',
          category: 'OPT_OUT',
          priority: 'LOW',
          requiresHumanAttention: false,
          lastMessageAt: new Date()
        }
      });

      await prisma.auditLog.create({
        data: {
          organizationId: dto.organizationId,
          action: 'OPT_OUT_PROCESSED',
          entityType: 'Person',
          entityId: person.id,
          details: JSON.stringify({
            phone: person.normalizedPhone,
            text: dto.text
          })
        }
      });

      return {
        messageId: inboundMessage.id,
        personId: person.id,
        personName: person.name,
        conversationId: conversation.id,
        isOptOut: true
      };
    }

    // 5. Coleta contexto do evento mais recente para a IA
    const lastAttendance = await prisma.attendance.findFirst({
      where: {
        personId: person.id,
        organizationId: dto.organizationId
      },
      include: { event: true },
      orderBy: { createdAt: 'desc' }
    });

    const lastOutbound = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        organizationId: dto.organizationId,
        direction: 'OUTBOUND'
      },
      orderBy: { createdAt: 'desc' }
    });

    const eventName = lastAttendance?.event?.name || 'nosso encontro';
    const eventDate = lastAttendance?.event?.eventDate
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(lastAttendance.event.eventDate))
      : undefined;

    // 6. Detecta configurações do Tenant e verticalProfile
    const [org, orgSettings] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: dto.organizationId },
        select: { metadata: true, name: true }
      }),
      prisma.organizationSettings.findUnique({
        where: { organizationId: dto.organizationId }
      })
    ]);

    const aiAutopilotEnabled = Boolean(orgSettings?.aiAutopilotEnabled);
    const aiAutoReplyMinConfidence = orgSettings?.aiAutoReplyMinConfidence ?? 0.80;

    let verticalProfile = 'DEFAULT';
    if (org?.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
      } catch {}
    }

    let category: string;
    let reason: string;
    let intent: string;
    let confidence: number;
    let sentiment: string;
    let urgency: string;
    let priority: string;
    let summary: string;
    let requiresHumanAttention: boolean;
    let suggestedReply: string | null;
    let nextAction: string;
    let modelUsed: string;
    let rawResponse: string;
    let taskTitle: string;
    let taskDescription: string;
    let autoReplySent = false;
    let outboundMessageId: string | undefined;
    let autopilotDecision: 'AUTO_REPLY' | 'HUMAN_ESCALATION' | 'DO_NOT_REPLY' | undefined;
    let memoryContext: any;

    if (verticalProfile === 'ACCOUNTING' || verticalProfile === 'CHURCH' || verticalProfile === 'YESHUA_CHURCHES') {
      // Extrai contexto do cliente a partir de person.notes ou person.name
      let clientName = person.name;
      let companyName = '';
      let churchName = '';
      let isChurch = verticalProfile === 'CHURCH' || verticalProfile === 'YESHUA_CHURCHES';

      if (person.notes) {
        try {
          const parsed = JSON.parse(person.notes);
          if (parsed.companyName) companyName = parsed.companyName;
          if (parsed.churchName) churchName = parsed.churchName;
          if (parsed.clientName) clientName = parsed.clientName;
          if (parsed.pastorName && !clientName) clientName = parsed.pastorName;
          if (parsed.isChurch !== undefined) isChurch = Boolean(parsed.isChurch);
        } catch {
          companyName = person.notes;
        }
      }

      if (!companyName && !churchName) {
        const match = person.name.match(/^(.*?)\s*\((.*?)\)$/);
        if (match) {
          clientName = match[1].trim();
          if (isChurch || /igreja|templo|minist(e|é)rio|comunidade/i.test(match[2])) {
            churchName = match[2].trim();
            isChurch = true;
          } else {
            companyName = match[2].trim();
          }
        }
      }

      // 1. Safety & Risk Gate (AccountingAIPolicy)
      const accResult = isChurch
        ? AccountingAIPolicy.analyzeChurch(consolidatedText, { clientName, churchName })
        : AccountingAIPolicy.analyze(consolidatedText, { clientName, companyName });

      // Verificação explícita de pedido de atendente / humano
      const isExplicitHumanRequest =
        /(falar com (o )?(humano|atendente|pessoa|algu(e|é)m|contador|especialista)|quero um humano|atendimento humano|falar com alguem|falar com um atendente)/i.test(
          consolidatedText
        );

      const hasMediaRisk = processedAttachments.some(att => {
        try {
          const meta = JSON.parse(att.metadataJson || '{}');
          return meta.factsExtracted?.notificacaoFiscal || meta.factsExtracted?.autoInfracao;
        } catch {
          return false;
        }
      });

      const isEscalation = accResult.isEscalation || isExplicitHumanRequest || hasMediaRisk;
      const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = isEscalation
        ? 'CRITICAL'
        : accResult.urgency === 'CRITICA' || accResult.urgency === 'ALTA'
        ? 'HIGH'
        : 'LOW';

      // 2. Carrega Memória Persistente Tenant-Aware
      memoryContext = await ConversationMemoryService.loadContext(
        dto.organizationId,
        person.id,
        conversation.id
      );

      // 3. Geração com Modelo Real de IA (Gemini) se disponível
      let aiReplyResult: AccountingAIReplyResult | null = null;
      if (typeof this.aiService.generateAccountingReply === 'function') {
        try {
          aiReplyResult = await this.aiService.generateAccountingReply({
            organization: {
              id: dto.organizationId,
              name: org?.name || 'Yeshua Contabilidade',
              vertical: verticalProfile
            },
            person: {
              id: person.id,
              name: person.name,
              normalizedPhone: person.normalizedPhone,
              notes: person.notes
            },
            memory: {
              summary: memoryContext.summary,
              facts: memoryContext.facts,
              openItems: memoryContext.openItems,
              preferences: memoryContext.preferences
            },
            recentMessages: memoryContext.recentMessages.map((m: any) => ({
              sender: m.direction,
              text: m.content,
              createdAt: m.createdAt,
              attachmentsSummary: m.attachmentsSummary
            })),
            inboundMessage: {
              id: inboundMessage.id,
              text: rawText || (processedAttachments[0]?.transcript || processedAttachments[0]?.aiSummary || inboundMessage.content),
              receivedAt: inboundMessage.createdAt,
              attachments: processedAttachments.map(att => ({
                id: att.id,
                type: att.type as any,
                mimeType: att.mimeType,
                fileName: att.fileName,
                sizeBytes: att.sizeBytes,
                providerMediaId: att.providerMediaId,
                storageKey: att.storageKey,
                sha256: att.sha256,
                caption: att.caption,
                transcript: att.transcript,
                extractedText: att.extractedText,
                aiSummary: att.aiSummary
              }))
            },
            riskClassification: {
              riskLevel,
              isEscalation,
              reason: accResult.reasonSummary
            }
          });
        } catch (err: any) {
          console.warn(`[ProcessInboundMessageUseCase] Erro na geração com IA Real: ${err.message}`);
        }
      }

      // 4. Harmonização de Classificação, Decisão e Safety Gate
      if (aiReplyResult) {
        if (isEscalation) {
          aiReplyResult.decision = 'HUMAN_ESCALATION';
          aiReplyResult.riskLevel = 'CRITICAL';
        }

        const isLowConfidence = aiReplyResult.confidence < aiAutoReplyMinConfidence;
        if (isLowConfidence) {
          aiReplyResult.decision = 'HUMAN_ESCALATION';
        }

        const isAiEscalated =
          aiReplyResult.decision === 'HUMAN_ESCALATION' ||
          aiReplyResult.riskLevel === 'CRITICAL' ||
          aiReplyResult.riskLevel === 'HIGH' ||
          isEscalation;

        requiresHumanAttention = Boolean(isAiEscalated);

        category =
          isEscalation || aiReplyResult.providerUsed === 'NONE'
            ? accResult.category
            : aiReplyResult.category || accResult.category;
        reason = accResult.reasonSummary;
        intent = aiReplyResult.intent || accResult.intent;
        confidence = aiReplyResult.confidence;
        sentiment = accResult.sentiment;
        urgency = accResult.urgency;
        priority = isEscalation ? 'URGENT' : requiresHumanAttention ? 'HIGH' : accResult.priority;
        summary = accResult.reasonSummary;
        suggestedReply =
          isEscalation || aiReplyResult.providerUsed === 'NONE'
            ? accResult.suggestedReply || aiReplyResult.reply
            : aiReplyResult.reply || accResult.suggestedReply;
        nextAction = isEscalation
          ? (accResult.nextAction || 'ESCALATE_TO_SENIOR_AUDITOR')
          : requiresHumanAttention
          ? 'REQUIRE_HUMAN_INTERVENTION'
          : 'AUTO_REPLY_SENT';
        modelUsed =
          aiReplyResult.providerUsed === 'NONE'
            ? isChurch
              ? 'YESHUA_CHURCH_AI'
              : 'YESHUA_ACCOUNTING_AI'
            : aiReplyResult.modelUsed || aiReplyResult.providerUsed || (isChurch ? 'YESHUA_CHURCH_AI' : 'YESHUA_ACCOUNTING_AI');
        rawResponse = JSON.stringify(aiReplyResult);
        autopilotDecision = aiReplyResult.decision;
      } else {
        category = accResult.category;
        reason = accResult.reasonSummary;
        intent = accResult.intent;
        confidence = accResult.confidenceScore;
        sentiment = accResult.sentiment;
        urgency = accResult.urgency;
        priority = accResult.priority;
        summary = accResult.reasonSummary;
        requiresHumanAttention = accResult.requiresAttention || isEscalation;
        suggestedReply = accResult.suggestedReply;
        nextAction = accResult.nextAction;
        modelUsed = isChurch ? 'YESHUA_CHURCH_AI' : 'YESHUA_ACCOUNTING_AI';
        rawResponse = JSON.stringify(accResult);
        autopilotDecision = isEscalation ? 'HUMAN_ESCALATION' : 'AUTO_REPLY';
      }

      taskTitle = isChurch
        ? `Pendência Eclesiástica: ${person.name} (${accResult.categoryLabel || category})`
        : `Pendência Contábil: ${person.name} (${accResult.categoryLabel || category})`;
      taskDescription = isChurch
        ? `Assunto: ${accResult.reasonSummary || summary}\nAção Recomendada: ${accResult.suggestedAction || nextAction}`
        : `Assunto: ${accResult.reasonSummary || summary}\nAção Contábil Recomendada: ${accResult.suggestedAction || nextAction}`;

      // 5. Execução do Autopilot (Envio Automático se Elegível)
      const canAutoReply =
        !person.optOut &&
        aiAutopilotEnabled &&
        aiReplyResult !== null &&
        aiReplyResult.providerUsed !== 'NONE' &&
        aiReplyResult.providerUsed !== 'FALLBACK_OFFLINE' &&
        aiReplyResult.decision === 'AUTO_REPLY' &&
        (aiReplyResult.riskLevel === 'LOW' || aiReplyResult.riskLevel === 'MEDIUM') &&
        aiReplyResult.confidence >= aiAutoReplyMinConfidence;

      if (canAutoReply && aiReplyResult && suggestedReply) {
        // Idempotência obrigatória: no máximo 1 auto-reply por inbound
        const existingOutbound = await prisma.message.findFirst({
          where: {
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            createdAt: { gte: inboundMessage.createdAt }
          }
        });

        if (!existingOutbound) {
          // Resolve provedor oficial configurado via WhatsAppProviderFactory (GPN em prod)
          const provider = await WhatsAppProviderFactory.getProviderForOrganization(dto.organizationId);
          const sendResult = await provider.sendTextMessage(person.normalizedPhone, suggestedReply);

          const outboundMsg = await prisma.message.create({
            data: {
              organizationId: dto.organizationId,
              conversationId: conversation.id,
              personId: person.id,
              direction: 'OUTBOUND',
              content: suggestedReply,
              status: sendResult.success ? 'SENT' : 'FAILED',
              providerMessageId: sendResult.messageId || null,
              sentAt: sendResult.success ? new Date() : null,
              errorMessage: sendResult.errorMessage || null
            }
          });

          outboundMessageId = outboundMsg.id;
          autoReplySent = sendResult.success;

          await prisma.auditLog.create({
            data: {
              organizationId: dto.organizationId,
              action: sendResult.success ? 'AI_AUTO_REPLY_SENT' : 'AI_PROVIDER_FAILED',
              entityType: 'Message',
              entityId: outboundMsg.id,
              details: JSON.stringify({
                recipient: person.normalizedPhone,
                provider: sendResult.provider,
                providerMessageId: sendResult.messageId,
                model: aiReplyResult.modelUsed || 'GEMINI',
                confidence: aiReplyResult.confidence,
                decision: aiReplyResult.decision,
                latencyMs: aiReplyResult.latencyMs,
                tokensUsed: aiReplyResult.tokensUsed,
                success: sendResult.success,
                errorMessage: sendResult.errorMessage
              })
            }
          });

          const mediaFacts: Record<string, any> = {};
          for (const att of processedAttachments) {
            try {
              const meta = JSON.parse(att.metadataJson || '{}');
              if (meta.factsExtracted) {
                Object.assign(mediaFacts, meta.factsExtracted);
              }
            } catch {}
            if (att.type === 'AUDIO') {
              mediaFacts.ultimoAudioRecebido = att.fileName;
            } else if (att.type === 'IMAGE' || att.type === 'DOCUMENT' || att.type === 'PDF') {
              if (!mediaFacts.documentosRecebidos) mediaFacts.documentosRecebidos = [];
              mediaFacts.documentosRecebidos.push({
                tipo: att.type,
                nome: att.fileName,
                resumo: att.aiSummary
              });
            }
          }

          const mergedFacts = {
            ...mediaFacts,
            ...(aiReplyResult.memoryUpdates?.facts || {})
          };

          await ConversationMemoryService.updateAfterInbound(
            conversation.id,
            inboundMessage.id,
            {
              ...aiReplyResult.memoryUpdates,
              facts: mergedFacts
            }
          );

          if (sendResult.success) {
            await ConversationMemoryService.updateAfterOutbound(
              conversation.id,
              outboundMsg.id
            );
            await ConversationMemoryService.summarizeIfNeeded(
              conversation.id,
              (rawText || initialContent).slice(0, 80),
              suggestedReply
            );
            requiresHumanAttention = false;
          }
        }
      } else {
        // Quando não há envio automático
        if (aiReplyResult?.decision === 'HUMAN_ESCALATION' || isEscalation) {
          await prisma.auditLog.create({
            data: {
              organizationId: dto.organizationId,
              action: 'AI_ESCALATED',
              entityType: 'Conversation',
              entityId: conversation.id,
              details: JSON.stringify({
                category,
                reason: summary,
                riskLevel: aiReplyResult?.riskLevel || 'CRITICAL',
                confidence: aiReplyResult?.confidence || confidence,
                isExplicitHumanRequest
              })
            }
          });
        } else {
          await prisma.auditLog.create({
            data: {
              organizationId: dto.organizationId,
              action: 'AI_REPLY_GENERATED',
              entityType: 'Conversation',
              entityId: conversation.id,
              details: JSON.stringify({
                category,
                decision: aiReplyResult?.decision || 'SUGGESTION_ONLY',
                confidence: aiReplyResult?.confidence || confidence,
                autopilotEnabled: aiAutopilotEnabled
              })
            }
          });
        }

        const mediaFacts: Record<string, any> = {};
        for (const att of processedAttachments) {
          try {
            const meta = JSON.parse(att.metadataJson || '{}');
            if (meta.factsExtracted) {
              Object.assign(mediaFacts, meta.factsExtracted);
            }
          } catch {}
          if (att.type === 'AUDIO') {
            mediaFacts.ultimoAudioRecebido = att.fileName;
          } else if (att.type === 'IMAGE' || att.type === 'DOCUMENT' || att.type === 'PDF') {
            if (!mediaFacts.documentosRecebidos) mediaFacts.documentosRecebidos = [];
            mediaFacts.documentosRecebidos.push({
              tipo: att.type,
              nome: att.fileName,
              resumo: att.aiSummary
            });
          }
        }

        const mergedFacts = {
          ...mediaFacts,
          ...(aiReplyResult?.memoryUpdates?.facts || {})
        };

        await ConversationMemoryService.updateAfterInbound(
          conversation.id,
          inboundMessage.id,
          {
            ...aiReplyResult?.memoryUpdates,
            facts: mergedFacts
          }
        );
        await ConversationMemoryService.summarizeIfNeeded(
          conversation.id,
          (rawText || initialContent).slice(0, 80)
        );
      }
    } else {
      // Fluxo DEFAULT (Análise de Ausência Pastoral / Eventos)
      const aiResult = await this.aiService.classifyAbsence(rawText || initialContent, {
        personName: person.name,
        eventName,
        eventDate,
        outboundMessageText: lastOutbound?.content
      });
      category = aiResult.category;
      reason = aiResult.reason || aiResult.summary;
      intent = aiResult.intent || 'JUSTIFY_ABSENCE';
      confidence = aiResult.confidence;
      sentiment = aiResult.sentiment;
      urgency = aiResult.urgency || 'MEDIA';
      priority = aiResult.priority || 'MEDIUM';
      summary = aiResult.summary;
      requiresHumanAttention = aiResult.requires_human_attention;
      suggestedReply = aiResult.suggested_reply || null;
      nextAction = aiResult.next_action || 'REQUIRE_HUMAN_APPROVAL';
      modelUsed = aiResult.providerUsed;
      rawResponse = JSON.stringify(aiResult);
      taskTitle = `Acompanhamento Pastoral: ${person.name} (${aiResult.category})`;
      taskDescription = `Motivo: ${aiResult.summary}\nPróxima ação recomendada: ${aiResult.next_action}`;
    }

    // 7. Persiste a análise estruturada de IA com organizationId
    await prisma.aIAnalysis.create({
      data: {
        organizationId: dto.organizationId,
        messageId: inboundMessage.id,
        conversationId: conversation.id,
        category,
        reason,
        intent,
        confidence,
        sentiment,
        urgency,
        priority,
        summary,
        requiresHumanAttention,
        suggestedReply,
        nextAction,
        modelUsed,
        rawResponse
      }
    });

    // 8. Atualiza a Conversa com os novos insights de IA e prioridade
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: 'REPLIED',
        category,
        priority,
        requiresHumanAttention
      }
    });

    // 9. Criação Automática de Tarefa / Pendência para casos que exigem atenção
    let followUpTaskId: string | undefined;
    if (requiresHumanAttention || priority === 'HIGH' || priority === 'URGENT') {
      const task = await prisma.followUpTask.create({
        data: {
          organizationId: dto.organizationId,
          personId: person.id,
          conversationId: conversation.id,
          title: taskTitle,
          description: taskDescription,
          priority,
          status: 'PENDING'
        }
      });
      followUpTaskId = task.id;

      await prisma.auditLog.create({
        data: {
          organizationId: dto.organizationId,
          action: 'FOLLOW_UP_TASK_CREATED',
          entityType: 'FollowUpTask',
          entityId: task.id,
          details: JSON.stringify({
            person: person.name,
            category,
            priority
          })
        }
      });
    }

    return {
      messageId: inboundMessage.id,
      personId: person.id,
      personName: person.name,
      conversationId: conversation.id,
      isOptOut: false,
      attachments: processedAttachments,
      classification: {
        category,
        intent,
        confidence,
        sentiment,
        urgency,
        priority,
        summary,
        requiresHumanAttention,
        suggestedReply: suggestedReply || undefined,
        nextAction,
        providerUsed: modelUsed
      },
      followUpTaskId,
      autoReplySent,
      outboundMessageId,
      autopilotDecision,
      memoryContext
    };
  }
}

