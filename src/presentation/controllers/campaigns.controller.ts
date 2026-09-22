import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { DispatchCampaignUseCase } from '../../application/use-cases/dispatch-campaign.use-case.js';
import { WhatsAppProviderFactory } from '../../infrastructure/whatsapp/whatsapp-provider.factory.js';
import { IWhatsAppProvider } from '../../domain/ports/whatsapp-provider.port.js';

export class CampaignsController {
  constructor(private defaultProvider?: IWhatsAppProvider) {}

  async list(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const campaigns = await prisma.campaign.findMany({
        where: { organizationId },
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
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const campaign = await prisma.campaign.findFirst({
        where: { id, organizationId },
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

  private async resolveProvider(organizationId: string): Promise<IWhatsAppProvider> {
    if (process.env.NODE_ENV === 'production') {
      return WhatsAppProviderFactory.getProviderForOrganization(organizationId);
    }
    return this.defaultProvider || WhatsAppProviderFactory.getProviderForOrganization(organizationId);
  }

  async dispatch(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const { eventId, type, templateName, messageTemplate } = req.body;

      if (!eventId || !type || !messageTemplate) {
        res.status(400).json({ error: 'eventId, type e messageTemplate são campos obrigatórios' });
        return;
      }

      // Obtém o provedor configurado para esta organização
      const orgProvider = await this.resolveProvider(organizationId);
      const useCase = new DispatchCampaignUseCase(orgProvider);

      const result = await useCase.execute({
        organizationId,
        eventId,
        type,
        templateName,
        messageTemplate
      }, orgProvider);

      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
