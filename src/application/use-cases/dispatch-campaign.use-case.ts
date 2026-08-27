import { prisma } from '../../infrastructure/database/prisma.client.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';

export interface DispatchCampaignDTO {
  eventId: string;
  type: 'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP';
  templateName?: string;
  messageTemplate: string; // Ex: "Olá, {{nome}}! Graça e Paz! Sentimos sua falta no {{evento}}..."
}

export interface DispatchCampaignResult {
  campaignId: string;
  type: string;
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  optOutIgnored: number;
  messages: Array<{
    personId: string;
    personName: string;
    phone: string;
    status: string;
    messageId?: string;
    error?: string;
  }>;
}

export class DispatchCampaignUseCase {
  constructor(private whatsappProvider: IWhatsAppProvider) {}

  async execute(dto: DispatchCampaignDTO): Promise<DispatchCampaignResult> {
    const event = await prisma.event.findUnique({
      where: { id: dto.eventId },
      include: {
        attendances: {
          include: {
            person: true
          }
        }
      }
    });

    if (!event) {
      throw new Error(`Evento com ID ${dto.eventId} não encontrado`);
    }

    const isPresentFollowup = dto.type === 'PRESENTE_FOLLOWUP';

    // Filtra pelo segmento correto
    const targetAttendances = event.attendances.filter(
      att => att.attended === isPresentFollowup
    );

    // Cria a campanha no banco
    const campaign = await prisma.campaign.create({
      data: {
        eventId: event.id,
        name: `Campanha Pós-Evento: ${event.name} (${isPresentFollowup ? 'Presentes' : 'Ausentes'})`,
        type: dto.type,
        templateName: dto.templateName || (isPresentFollowup ? 'pos_evento_presente' : 'pos_evento_ausente'),
        messageBody: dto.messageTemplate,
        status: 'RUNNING',
        totalRecipients: targetAttendances.length
      }
    });

    let sentCount = 0;
    let failedCount = 0;
    let optOutCount = 0;
    const dispatchedMessages: DispatchCampaignResult['messages'] = [];

    for (const att of targetAttendances) {
      const person = att.person;

      // Respeito rigoroso à LGPD: se pediu opt-out, não envia
      if (person.optOut) {
        optOutCount++;
        dispatchedMessages.push({
          personId: person.id,
          personName: person.name,
          phone: person.normalizedPhone,
          status: 'OPT_OUT_IGNORED',
          error: 'Titular solicitou descadastramento previamente'
        });
        continue;
      }

      // 1. Garante a existência da conversa
      let conversation = await prisma.conversation.findFirst({
        where: { personId: person.id }
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            personId: person.id,
            status: 'OPEN',
            requiresHumanAttention: false
          }
        });
      }

      // 2. Renderiza a mensagem personalizada com tags
      const formattedDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(event.eventDate));
      const firstName = person.name.split(' ')[0];
      const params: Record<string, string> = {
        nome: firstName,
        nome_completo: person.name,
        evento: event.name,
        data: formattedDate
      };

      let renderedBody = dto.messageTemplate;
      for (const [key, val] of Object.entries(params)) {
        renderedBody = renderedBody.replace(new RegExp(`{{${key}}}`, 'g'), val);
      }

      // 3. Dispara via Provedor WhatsApp (Mock ou Meta Cloud API)
      const sendResult = await this.whatsappProvider.sendTemplateMessage(
        person.normalizedPhone,
        campaign.templateName || 'template_followup',
        params,
        renderedBody
      );

      // 4. Salva a mensagem no banco
      const messageStatus = sendResult.success ? 'SENT' : 'FAILED';
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          personId: person.id,
          campaignId: campaign.id,
          direction: 'OUTBOUND',
          providerMessageId: sendResult.messageId || null,
          content: renderedBody,
          status: messageStatus,
          errorMessage: sendResult.errorMessage || null,
          sentAt: sendResult.success ? new Date() : null
        }
      });

      // 5. Atualiza conversa
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          status: 'WAITING_REPLY'
        }
      });

      if (sendResult.success) {
        sentCount++;
      } else {
        failedCount++;
      }

      dispatchedMessages.push({
        personId: person.id,
        personName: person.name,
        phone: person.normalizedPhone,
        status: messageStatus,
        messageId: sendResult.messageId,
        error: sendResult.errorMessage
      });
    }

    // 6. Atualiza o status consolidado da Campanha
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'COMPLETED',
        totalSent: sentCount,
        totalFailed: failedCount
      }
    });

    // 7. Log de Auditoria
    await prisma.auditLog.create({
      data: {
        action: 'CAMPAIGN_DISPATCHED',
        entityType: 'Campaign',
        entityId: campaign.id,
        details: JSON.stringify({
          eventName: event.name,
          type: dto.type,
          recipients: targetAttendances.length,
          sent: sentCount,
          failed: failedCount,
          optOuts: optOutCount
        })
      }
    });

    return {
      campaignId: campaign.id,
      type: dto.type,
      totalRecipients: targetAttendances.length,
      totalSent: sentCount,
      totalFailed: failedCount,
      optOutIgnored: optOutCount,
      messages: dispatchedMessages
    };
  }
}
