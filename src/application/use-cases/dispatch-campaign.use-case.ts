import { prisma } from '../../infrastructure/database/prisma.client.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';

export interface DispatchCampaignDTO {
  organizationId: string;
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
  constructor(private defaultProvider?: IWhatsAppProvider) {}

  async execute(dto: DispatchCampaignDTO, customProvider?: IWhatsAppProvider): Promise<DispatchCampaignResult> {
    const provider = customProvider || this.defaultProvider;
    if (!provider) {
      throw new Error('Nenhum provedor de WhatsApp configurado para este envio');
    }

    const event = await prisma.event.findFirst({
      where: {
        id: dto.eventId,
        organizationId: dto.organizationId
      },
      include: {
        attendances: {
          include: {
            person: true
          }
        }
      }
    });

    if (!event) {
      throw new Error(`Evento com ID ${dto.eventId} não encontrado na sua organização`);
    }

    const isPresentFollowup = dto.type === 'PRESENTE_FOLLOWUP';

    // Filtra pelo segmento correto
    const targetAttendances = event.attendances.filter(
      att => att.attended === isPresentFollowup
    );

    // Cria a campanha no banco isolada por Tenant
    const campaign = await prisma.campaign.create({
      data: {
        organizationId: dto.organizationId,
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

      // 1. Garante a existência da conversa isolada por Tenant
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

      // 3. Dispara via Provedor WhatsApp da organização
      const sendResult = await provider.sendTemplateMessage(
        person.normalizedPhone,
        campaign.templateName || 'template_followup',
        params,
        renderedBody
      );

      // 4. Salva a mensagem no banco com organizationId
      const messageStatus = sendResult.success ? 'SENT' : 'FAILED';
      await prisma.message.create({
        data: {
          organizationId: dto.organizationId,
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

    // 7. Log de Auditoria com organizationId
    await prisma.auditLog.create({
      data: {
        organizationId: dto.organizationId,
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
