import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { CryptoService } from '../../infrastructure/security/crypto.service.js';

export class OrganizationController {
  /**
   * Lista as organizações do usuário logado para o Org Switcher
   */
  async listMyOrganizations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user.id;

      const members = await prisma.member.findMany({
        where: { userId },
        include: {
          organization: {
            include: {
              settings: true,
              whatsAppConnection: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      const orgs = members.map(m => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        logo: m.organization.logo,
        role: m.role,
        isMock: m.organization.whatsAppConnection?.isMock ?? true,
        whatsAppStatus: m.organization.whatsAppConnection?.status ?? 'CONNECTED'
      }));

      res.json(orgs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Cria uma nova organização e associa o criador como OWNER
   */
  async createOrganization(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const { name, slug } = req.body;

      if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Nome da organização é obrigatório' });
        return;
      }

      const orgSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

      const organization = await prisma.organization.create({
        data: {
          name,
          slug: orgSlug,
          members: {
            create: {
              userId,
              role: 'OWNER'
            }
          },
          settings: {
            create: {
              timezone: 'America/Sao_Paulo',
              language: 'pt-BR',
              aiProvider: 'GEMINI'
            }
          },
          whatsAppConnection: {
            create: {
              isMock: true,
              status: 'CONNECTED'
            }
          }
        },
        include: {
          settings: true,
          whatsAppConnection: true
        }
      });

      // Atualiza activeOrganizationId na sessão se disponível
      if (req.session?.id) {
        await prisma.session.update({
          where: { id: req.session.id },
          data: { activeOrganizationId: organization.id }
        });
      }

      res.status(201).json(organization);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Obtém as configurações e status da conexão WhatsApp da organização ativa
   */
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;

      const [organization, settings, connection] = await Promise.all([
        prisma.organization.findUnique({ where: { id: organizationId } }),
        prisma.organizationSettings.findUnique({ where: { organizationId } }),
        prisma.whatsAppConnection.findUnique({ where: { organizationId } })
      ]);

      if (!organization) {
        res.status(404).json({ error: 'Organização não encontrada' });
        return;
      }

      res.json({
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo
        },
        settings: {
          timezone: settings?.timezone || 'America/Sao_Paulo',
          language: settings?.language || 'pt-BR',
          aiProvider: settings?.aiProvider || 'GEMINI',
          hasCustomGeminiKey: !!settings?.encryptedGeminiKey,
          hasCustomOpenAiKey: !!settings?.encryptedOpenAiKey,
          promptOverrides: settings?.promptOverrides || ''
        },
        whatsApp: {
          isMock: connection?.isMock ?? true,
          status: connection?.status || 'CONNECTED',
          phoneNumberId: connection?.phoneNumberId || '',
          wabaId: connection?.wabaId || '',
          webhookVerifyToken: connection?.webhookVerifyToken || '',
          hasAccessToken: !!connection?.encryptedAccessToken,
          hasAppSecret: !!connection?.encryptedAppSecret
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Atualiza as configurações de IA e timezone
   */
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const { timezone, language, aiProvider, geminiApiKey, openAiApiKey, promptOverrides } = req.body;

      const updateData: any = {
        timezone,
        language,
        aiProvider,
        promptOverrides
      };

      if (geminiApiKey !== undefined) {
        updateData.encryptedGeminiKey = geminiApiKey ? CryptoService.encrypt(geminiApiKey) : null;
      }
      if (openAiApiKey !== undefined) {
        updateData.encryptedOpenAiKey = openAiApiKey ? CryptoService.encrypt(openAiApiKey) : null;
      }

      const updated = await prisma.organizationSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...updateData
        },
        update: updateData
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Atualiza as credenciais da WhatsApp Cloud API por organização
   */
  async updateWhatsAppConnection(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const { isMock, phoneNumberId, wabaId, accessToken, appSecret, webhookVerifyToken } = req.body;

      const updateData: any = {
        isMock: isMock ?? true,
        phoneNumberId,
        wabaId,
        webhookVerifyToken: webhookVerifyToken || 'conecta_webhook_token_secret_2026',
        status: isMock ? 'CONNECTED' : (phoneNumberId && accessToken ? 'CONNECTED' : 'CONFIG_REQUIRED')
      };

      if (accessToken !== undefined && accessToken !== '') {
        updateData.encryptedAccessToken = CryptoService.encrypt(accessToken);
      }
      if (appSecret !== undefined && appSecret !== '') {
        updateData.encryptedAppSecret = CryptoService.encrypt(appSecret);
      }

      const connection = await prisma.whatsAppConnection.upsert({
        where: { organizationId },
        create: {
          organizationId,
          ...updateData
        },
        update: updateData
      });

      res.json({
        success: true,
        isMock: connection.isMock,
        status: connection.status,
        phoneNumberId: connection.phoneNumberId,
        wabaId: connection.wabaId
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
