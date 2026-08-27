import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { DispatchCampaignUseCase } from '../../application/use-cases/dispatch-campaign.use-case.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';

export class CampaignsController {
  constructor(private whatsappProvider: IWhatsAppProvider) {}

  async list(_req: Request, res: Response): Promise<void> {
    try {
      const campaigns = await prisma.campaign.findMany({
        include: {
          event: true,
          _count: {
            select: { messages: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(campaigns);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          event: true,
          messages: {
            include: {
              person: true
            }
          }
        }
      });

      if (!campaign) {
        res.status(404).json({ error: 'Campanha não encontrada' });
        return;
      }

      res.json(campaign);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async dispatch(req: Request, res: Response): Promise<void> {
    try {
      const { eventId, type, templateName, messageTemplate } = req.body;

      if (!eventId || !type || !messageTemplate) {
        res.status(400).json({ error: 'eventId, type e messageTemplate são campos obrigatórios' });
        return;
      }

      const useCase = new DispatchCampaignUseCase(this.whatsappProvider);
      const result = await useCase.execute({
        eventId,
        type,
        templateName,
        messageTemplate
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
