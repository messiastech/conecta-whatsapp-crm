import { prisma } from '../../infrastructure/database/prisma.client.js';
import { IAIService } from '../../domain/ports/ai-service.port.js';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';

export interface ProcessInboundMessageDTO {
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

    // 1. Localiza ou cria a Pessoa
    let person = await prisma.person.findUnique({
      where: { normalizedPhone }
    });

    if (!person) {
      person = await prisma.person.create({
        data: {
          name: 'Participante (WhatsApp)',
          phone: dto.fromPhone,
          normalizedPhone,
          optOut: false,
          consentStatus: 'OPTED_IN',
          consentSource: 'INBOUND_MESSAGE'
        }
      });
    }

    // 2. Garante a conversa
    let conversation = await prisma.conversation.findFirst({
      where: { personId: person.id }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          personId: person.id,
          status: 'OPEN',
          priority: 'MEDIUM',
          requiresHumanAttention: false
        }
      });
    }

    // 3. Salva a mensagem recebida no banco
    const inboundMessage = await prisma.message.create({
      data: {
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

      // Registra no histórico formal de consentimento
      await prisma.consentHistory.create({
        data: {
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
      where: { personId: person.id },
      include: { event: true },
      orderBy: { createdAt: 'desc' }
    });

    const lastOutbound = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND'
      },
      orderBy: { createdAt: 'desc' }
    });

    const eventName = lastAttendance?.event?.name || 'nosso encontro';
    const eventDate = lastAttendance?.event?.eventDate
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(lastAttendance.event.eventDate))
      : undefined;

    // 6. Executa a análise inteligente com IA
    const aiResult = await this.aiService.classifyAbsence(dto.text, {
      personName: person.name,
      eventName,
      eventDate,
      outboundMessageText: lastOutbound?.content
    });

    // 7. Persiste a análise estruturada de IA
    const aiAnalysisRecord = await prisma.aIAnalysis.create({
      data: {
        messageId: inboundMessage.id,
        conversationId: conversation.id,
        category: aiResult.category,
        reason: aiResult.reason || aiResult.summary,
        intent: aiResult.intent || 'JUSTIFY_ABSENCE',
        confidence: aiResult.confidence,
        sentiment: aiResult.sentiment,
        urgency: aiResult.urgency || 'MEDIA',
        priority: aiResult.priority || 'MEDIUM',
        summary: aiResult.summary,
        requiresHumanAttention: aiResult.requires_human_attention,
        suggestedReply: aiResult.suggested_reply || null,
        nextAction: aiResult.next_action || 'REQUIRE_HUMAN_APPROVAL',
        modelUsed: aiResult.providerUsed,
        rawResponse: JSON.stringify(aiResult)
      }
    });

    // 8. Atualiza a Conversa com os novos insights de IA e prioridade
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        status: 'REPLIED',
        category: aiResult.category,
        priority: aiResult.priority || 'MEDIUM',
        requiresHumanAttention: aiResult.requires_human_attention
      }
    });

    // 9. Criação Automática de Tarefa de Acompanhamento (Follow-Up Task) para casos críticos
    let followUpTaskId: string | undefined;
    if (aiResult.requires_human_attention || aiResult.priority === 'HIGH' || aiResult.priority === 'URGENT') {
      const task = await prisma.followUpTask.create({
        data: {
          personId: person.id,
          conversationId: conversation.id,
          title: `Acompanhamento Pastoral: ${person.name} (${aiResult.category})`,
          description: `Motivo: ${aiResult.summary}\nPróxima ação recomendada: ${aiResult.next_action}`,
          priority: aiResult.priority || 'HIGH',
          status: 'PENDING'
        }
      });
      followUpTaskId = task.id;

      await prisma.auditLog.create({
        data: {
          action: 'FOLLOW_UP_TASK_CREATED',
          entityType: 'FollowUpTask',
          entityId: task.id,
          details: JSON.stringify({
            person: person.name,
            category: aiResult.category,
            priority: aiResult.priority
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
      followUpTaskId,
      classification: {
        category: aiResult.category,
        intent: aiResult.intent || 'JUSTIFY_ABSENCE',
        confidence: aiResult.confidence,
        sentiment: aiResult.sentiment,
        urgency: aiResult.urgency || 'MEDIA',
        priority: aiResult.priority || 'MEDIUM',
        summary: aiResult.summary,
        requiresHumanAttention: aiResult.requires_human_attention,
        suggestedReply: aiResult.suggested_reply,
        nextAction: aiResult.next_action || 'REQUIRE_HUMAN_APPROVAL',
        providerUsed: aiResult.providerUsed
      }
    };
  }
}
