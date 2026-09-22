import { prisma } from '../../infrastructure/database/prisma.client.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';
import { AccountingAIPolicy } from '../verticals/accounting/accounting-ai-policy.js';

export interface ProcessInboundMessageDTO {
  organizationId: string;
  fromPhone: string;
  text: string;
  providerMessageId?: string;
  rawPayload?: any;
}

export interface ProcessInboundMessageResult {
  messageId: string;
  personId: string;
  personName: string;
  conversationId: string;
  isOptOut: boolean;
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
}

export class ProcessInboundMessageUseCase {
  constructor(private aiService: IAIService) {}

  async execute(dto: ProcessInboundMessageDTO): Promise<ProcessInboundMessageResult> {
    const normalizedResult = PhoneNumber.normalize(dto.fromPhone);
    const normalizedPhone = normalizedResult.normalizedPhone || dto.fromPhone;

    // 0. Verificação de Idempotência (Meta Webhook Redelivery / Retries)
    if (dto.providerMessageId) {
      const existingMessage = await prisma.message.findUnique({
        where: { providerMessageId: dto.providerMessageId },
        include: {
          person: true,
          aiAnalyses: {
            take: 1,
            orderBy: { createdAt: 'desc' }
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
          name: 'Participante (WhatsApp)',
          phone: dto.fromPhone,
          normalizedPhone,
          optOut: false,
          consentStatus: 'OPTED_IN',
          consentSource: 'INBOUND_MESSAGE'
        }
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
    let inboundMessage;
    try {
      inboundMessage = await prisma.message.create({
        data: {
          organizationId: dto.organizationId,
          conversationId: conversation.id,
          personId: person.id,
          direction: 'INBOUND',
          providerMessageId: dto.providerMessageId || null,
          content: dto.text,
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
          include: { person: true }
        });
        if (retryFound) {
          return {
            messageId: retryFound.id,
            personId: retryFound.personId,
            personName: retryFound.person.name,
            conversationId: retryFound.conversationId,
            isOptOut: retryFound.person.optOut
          };
        }
      }
      throw err;
    }

    // 4. Verificação de Opt-Out Imediato (LGPD / Meta Compliance)
    const optOutRegex = /^(stop|sair|parar|cancelar|descadastrar|remover|n(a|ã)o\s*quero\s*mais|n(a|ã)o\s*mandem\s*mais)$/i;
    const isOptOut = optOutRegex.test(dto.text.trim());

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

    // 6. Detecta o verticalProfile do Tenant via Organization.metadata
    const org = await prisma.organization.findUnique({
      where: { id: dto.organizationId },
      select: { metadata: true, name: true }
    });

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

      // Análise Contábil / Eclesiástica da Yeshua
      const accResult = isChurch
        ? AccountingAIPolicy.analyzeChurch(dto.text, { clientName, churchName })
        : AccountingAIPolicy.analyze(dto.text, { clientName, companyName });

      category = accResult.category;
      reason = accResult.reasonSummary;
      intent = accResult.intent;
      confidence = accResult.confidenceScore;
      sentiment = accResult.sentiment;
      urgency = accResult.urgency;
      priority = accResult.priority;
      summary = accResult.reasonSummary;
      requiresHumanAttention = accResult.requiresAttention;
      suggestedReply = accResult.suggestedReply;
      nextAction = accResult.nextAction;
      modelUsed = isChurch ? 'YESHUA_CHURCH_AI' : 'YESHUA_ACCOUNTING_AI';
      rawResponse = JSON.stringify(accResult);
      taskTitle = isChurch
        ? `Pendência Eclesiástica: ${person.name} (${accResult.categoryLabel})`
        : `Pendência Contábil: ${person.name} (${accResult.categoryLabel})`;
      taskDescription = isChurch
        ? `Assunto: ${accResult.reasonSummary}\nAção Recomendada: ${accResult.suggestedAction}`
        : `Assunto: ${accResult.reasonSummary}\nAção Contábil Recomendada: ${accResult.suggestedAction}`;
    } else {
      // Fluxo DEFAULT (Análise de Ausência Pastoral / Eventos)
      const aiResult = await this.aiService.classifyAbsence(dto.text, {
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
      followUpTaskId
    };
  }
}
