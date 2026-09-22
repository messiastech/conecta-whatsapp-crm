import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';
import { WhatsAppProviderFactory } from '../../infrastructure/whatsapp/whatsapp-provider.factory.js';

export class ConversationsController {
  constructor(private defaultProvider?: IWhatsAppProvider) {}

  async list(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const conversations = await prisma.conversation.findMany({
        where: { organizationId },
        include: {
          person: true,
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              aiAnalyses: true
            }
          },
          aiAnalyses: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });
      res.json(conversations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const conversation = await prisma.conversation.findFirst({
        where: { id, organizationId },
        include: {
          person: {
            include: {
              attendances: {
                include: { event: true },
                orderBy: { createdAt: 'desc' }
              }
            }
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: {
              aiAnalyses: true
            }
          }
        }
      });

      if (!conversation) {
        res.status(404).json({ error: 'Conversa não encontrada' });
        return;
      }

      res.json(conversation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async reply(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const { text } = req.body;

      if (!text || text.trim().length === 0) {
        res.status(400).json({ error: 'Texto da resposta é obrigatório' });
        return;
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id, organizationId },
        include: { person: true }
      });

      if (!conversation || !conversation.person) {
        res.status(404).json({ error: 'Conversa ou participante não encontrado' });
        return;
      }

      const person = conversation.person;

      // Validação da Janela de Atendimento de 24 horas (Regra Oficial da Meta Cloud API)
      // Aplica-se SOMENTE quando o provedor ativo da organização é META Cloud API.
      // GPN (Baileys) e Mock não possuem essa restrição.
      const providerType = await WhatsAppProviderFactory.getProviderType(organizationId);

      if (providerType !== 'GPN') {
        const lastInboundMessage = await prisma.message.findFirst({
          where: {
            conversationId: id,
            organizationId,
            direction: 'INBOUND'
          },
          orderBy: { createdAt: 'desc' }
        });

        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        const isWindowOpen =
          lastInboundMessage &&
          Date.now() - new Date(lastInboundMessage.createdAt).getTime() <= TWENTY_FOUR_HOURS_MS;

        if (!isWindowOpen) {
          res.status(422).json({
            error: 'JANELA_24H_EXPIRADA',
            message:
              'A janela de atendimento de 24 horas da Meta está fechada. Mensagens de texto livre só podem ser enviadas dentro de 24 horas após a última resposta do contato. Para reengajar após esse período, utilize um Template oficial aprovado pela Meta.'
          });
          return;
        }
      }

      const provider = this.defaultProvider || await WhatsAppProviderFactory.getProviderForOrganization(organizationId);

      const sendResult = await provider.sendTextMessage(
        person.normalizedPhone,
        text
      );

      const message = await prisma.message.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          personId: person.id,
          direction: 'OUTBOUND',
          providerMessageId: sendResult.messageId || null,
          content: text,
          status: sendResult.success ? 'SENT' : 'FAILED',
          errorMessage: sendResult.errorMessage || null,
          sentAt: sendResult.success ? new Date() : null
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          status: 'OPEN',
          requiresHumanAttention: false
        }
      });

      await prisma.auditLog.create({
        data: {
          organizationId,
          action: 'HUMAN_REPLY_SENT',
          entityType: 'Conversation',
          entityId: conversation.id,
          details: JSON.stringify({
            person: person.name,
            phone: person.normalizedPhone,
            text,
            success: sendResult.success,
            status: sendResult.status,
            errorMessage: sendResult.errorMessage || null
          })
        }
      });

      if (!sendResult.success) {
        res.status(502).json({
          error: 'OUTBOUND_SEND_FAILED',
          message: sendResult.errorMessage || 'Falha no envio da mensagem pelo provedor WhatsApp.',
          messageRecord: message,
          sendResult
        });
        return;
      }

      res.status(201).json({ message, sendResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async retry(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const messageId = String(req.params.messageId);

      const conversation = await prisma.conversation.findFirst({
        where: { id, organizationId },
        include: { person: true }
      });

      if (!conversation || !conversation.person) {
        res.status(404).json({ error: 'Conversa ou participante não encontrado' });
        return;
      }

      const existingMessage = await prisma.message.findFirst({
        where: { id: messageId, conversationId: id, organizationId }
      });

      if (!existingMessage) {
        res.status(404).json({ error: 'Mensagem não encontrada' });
        return;
      }

      const provider = this.defaultProvider || await WhatsAppProviderFactory.getProviderForOrganization(organizationId);
      const sendResult = await provider.sendTextMessage(
        conversation.person.normalizedPhone,
        existingMessage.content
      );

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          status: sendResult.success ? 'SENT' : 'FAILED',
          providerMessageId: sendResult.messageId || existingMessage.providerMessageId,
          errorMessage: sendResult.errorMessage || null,
          sentAt: sendResult.success ? new Date() : null
        }
      });

      if (!sendResult.success) {
        res.status(502).json({
          error: 'OUTBOUND_RETRY_FAILED',
          message: sendResult.errorMessage || 'Falha ao reenviar mensagem pelo provedor WhatsApp.',
          messageRecord: updated,
          sendResult
        });
        return;
      }

      res.status(200).json({ message: updated, sendResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
