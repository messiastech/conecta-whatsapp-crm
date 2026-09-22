import { prisma } from './prisma.client.js';
import { hashPassword } from 'better-auth/crypto';
import crypto from 'crypto';
import { CryptoService } from '../security/crypto.service.js';

export async function initYeshuaProduction() {
  console.log('========================================================================');
  console.log(' 🚀 [Init Yeshua Prod] Iniciando provisionamento idempotente de produção');
  console.log('========================================================================');

  const adminEmail = process.env.YESHUA_ADMIN_EMAIL || 'admin@yeshuacontabilidade.com.br';
  const adminPassword = process.env.YESHUA_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'YeshuaAdmin2026!');

  const orgSlug = 'yeshua-contabilidade-igrejas';
  const orgName = 'Yeshua Contabilidade — Gestão para Igrejas';

  // 1. Localiza ou cria o usuário Administrador de Produção
  let user = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!user) {
    if (!adminPassword) {
      throw new Error('[Init Yeshua Prod] FATAL: A variável YESHUA_ADMIN_PASSWORD é obrigatória para criação inicial do administrador em produção.');
    }
    const hashedPassword = await hashPassword(adminPassword);

    user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: 'Administrador Yeshua',
        email: adminEmail,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Cria conta de credencial no Better Auth apenas quando necessária
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    console.log(`[Init Yeshua Prod] ✅ Usuário administrador criado com credencial inicial: ${adminEmail}`);
  } else {
    // Usuário já existe: NÃO redefinir senha em todo restart!
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' }
    });

    if (existingAccount) {
      // Credencial já existe: preservar sem redefinir senha
      console.log(`[Init Yeshua Prod] ✅ Usuário administrador existente preservado sem alteração de senha: ${adminEmail}`);
    } else {
      // Criar credencial apenas quando necessária
      if (!adminPassword) {
        throw new Error('[Init Yeshua Prod] FATAL: Usuário existente sem credencial, YESHUA_ADMIN_PASSWORD é obrigatória para criar a credencial inicial.');
      }
      const hashedPassword = await hashPassword(adminPassword);
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      console.log(`[Init Yeshua Prod] ✅ Credencial criada apenas porque estava ausente para usuário existente: ${adminEmail}`);
    }
  }

  // 2. Localiza ou cria a Organização de Produção
  const canonicalMetadata = {
    verticalProfile: 'ACCOUNTING',
    brandName: 'YESHUA DESK IGREJAS',
    brandSubtitle: 'Contabilidade Especializada para Igrejas e Terceiro Setor',
    description: 'Gestão Contábil, Fiscal e Tributária Especializada para Igrejas e Organizações Religiosas'
  };

  let org = await prisma.organization.findFirst({
    where: {
      OR: [
        { slug: orgSlug },
        { name: orgName }
      ]
    },
    include: {
      settings: true,
      whatsAppConnection: true,
      gpnConnection: true
    }
  });

  const secureVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(24).toString('hex');

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
        metadata: JSON.stringify(canonicalMetadata),
        settings: {
          create: {
            timezone: 'America/Sao_Paulo',
            language: 'pt-BR',
            aiProvider: 'GEMINI'
          }
        },
        whatsAppConnection: {
          create: {
            isMock: false,
            status: 'DISCONNECTED',
            webhookVerifyToken: secureVerifyToken
          }
        }
      },
      include: {
        settings: true,
        whatsAppConnection: true,
        gpnConnection: true
      }
    });
    console.log(`[Init Yeshua Prod] ✅ Organização criada: ${orgName} (${org.id})`);
  } else {
    // NÃO substituir Organization.metadata integralmente!
    // Fazer merge preservando whatsappChannel, pendingWhatsAppReplacement,
    // gpnIncident, preferredProvider, flags e propriedades futuras.
    let currentMeta: Record<string, any> = {};
    if (org.metadata) {
      try {
        currentMeta = JSON.parse(org.metadata);
      } catch {
        currentMeta = {};
      }
    }

    const mergedMetadata: Record<string, any> = {
      ...canonicalMetadata,
      ...currentMeta, // Propriedades existentes no banco têm precedência
      verticalProfile: 'ACCOUNTING', // Garante perfil contábil canônico
      brandName: currentMeta.brandName || canonicalMetadata.brandName,
      brandSubtitle: currentMeta.brandSubtitle || canonicalMetadata.brandSubtitle,
      description: currentMeta.description || canonicalMetadata.description
    };

    // Preservação estrita das propriedades operacionais de mensageria e resiliência
    if (currentMeta.whatsappChannel) {
      mergedMetadata.whatsappChannel = currentMeta.whatsappChannel;
    }
    if (currentMeta.pendingWhatsAppReplacement) {
      mergedMetadata.pendingWhatsAppReplacement = currentMeta.pendingWhatsAppReplacement;
    }
    if (currentMeta.gpnIncident) {
      mergedMetadata.gpnIncident = currentMeta.gpnIncident;
    }
    if (currentMeta.preferredProvider) {
      mergedMetadata.preferredProvider = currentMeta.preferredProvider;
    }

    const newMetaString = JSON.stringify(mergedMetadata);
    if (org.metadata !== newMetaString || org.name !== orgName || org.slug !== orgSlug) {
      org = await prisma.organization.update({
        where: { id: org.id },
        data: {
          name: orgName,
          slug: orgSlug,
          metadata: newMetaString
        },
        include: {
          settings: true,
          whatsAppConnection: true,
          gpnConnection: true
        }
      });
      console.log(`[Init Yeshua Prod] ✅ Organização atualizada com merge seguro de metadados: ${orgName} (${org.id})`);
    } else {
      console.log(`[Init Yeshua Prod] ✅ Metadados da organização já íntegros e preservados: ${orgName} (${org.id})`);
    }
  }

  const orgId = org.id;

  // 3. Garante que OrganizationSettings está sincronizado com timezone America/Sao_Paulo e aiProvider GEMINI
  if (!org.settings) {
    await prisma.organizationSettings.create({
      data: {
        organizationId: orgId,
        timezone: 'America/Sao_Paulo',
        language: 'pt-BR',
        aiProvider: 'GEMINI'
      }
    });
  } else {
    await prisma.organizationSettings.update({
      where: { organizationId: orgId },
      data: {
        timezone: 'America/Sao_Paulo',
        aiProvider: 'GEMINI'
      }
    });
  }
  console.log(`[Init Yeshua Prod] ✅ Configurações da organização validadas (timezone: America/Sao_Paulo, aiProvider: GEMINI)`);

  // 4. Garante WhatsAppConnection em modo real (sem mocks em produção)
  if (!org.whatsAppConnection) {
    await prisma.whatsAppConnection.create({
      data: {
        organizationId: orgId,
        isMock: false,
        status: 'DISCONNECTED',
        webhookVerifyToken: secureVerifyToken
      }
    });
    console.log(`[Init Yeshua Prod] ✅ Conexão WhatsApp de produção criada (isMock: false)`);
  }

  // 5. GPN: Sincroniza process.env.GPN_API_URL como fonte autoritativa da infraestrutura
  const authoritativeGpnUrl = process.env.GPN_API_URL;
  const gpnApiKey = process.env.GPN_API_KEY;

  if (authoritativeGpnUrl) {
    const existingGpn = org.gpnConnection || await prisma.gpnConnection.findUnique({
      where: { organizationId: orgId }
    });

    if (!existingGpn) {
      if (gpnApiKey) {
        const gpnWebhookSecret = process.env.GPN_WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex');
        await prisma.gpnConnection.create({
          data: {
            organizationId: orgId,
            apiUrl: authoritativeGpnUrl,
            sessionId: `yeshua-prod-${crypto.randomBytes(4).toString('hex')}`,
            encryptedApiKey: CryptoService.encrypt(gpnApiKey),
            encryptedWebhookSecret: CryptoService.encrypt(gpnWebhookSecret),
            isActive: true,
            status: 'DISCONNECTED'
          }
        });
        console.log(`[Init Yeshua Prod] ✅ GpnConnection provisionado com GPN_API_URL autoritativa da Mega`);
      }
    } else if (process.env.NODE_ENV === 'production' && existingGpn.apiUrl !== authoritativeGpnUrl) {
      // Atualiza apiUrl se a Mega definiu nova URL autoritativa
      await prisma.gpnConnection.update({
        where: { organizationId: orgId },
        data: { apiUrl: authoritativeGpnUrl }
      });
      console.log(`[Init Yeshua Prod] ✅ GpnConnection sincronizado com URL autoritativa: ${authoritativeGpnUrl}`);
    }
  }

  // 6. Garante associação do usuário como OWNER
  const member = await prisma.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: user.id
      }
    }
  });

  if (!member) {
    await prisma.member.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        role: 'OWNER'
      }
    });
    console.log(`[Init Yeshua Prod] ✅ Usuário administrador associado como OWNER da organização`);
  } else if (member.role !== 'OWNER') {
    await prisma.member.update({
      where: { id: member.id },
      data: { role: 'OWNER' }
    });
    console.log(`[Init Yeshua Prod] ✅ Papel do usuário atualizado para OWNER`);
  }

  console.log('========================================================================');
  console.log(' 🎯 [Init Yeshua Prod] Provisionamento de PRODUÇÃO concluído com sucesso!');
  console.log(`  - Organização: "${orgName}"`);
  console.log(`  - Admin: ${adminEmail}`);
  console.log(`  - Perfil: ACCOUNTING (YESHUA DESK IGREJAS)`);
  console.log(`  - Timezone: America/Sao_Paulo | IA: GEMINI`);
  console.log(`  - Metadados: Preservados e mesclados de forma não-destrutiva`);
  console.log(`  - Credencial: Preservada sem alteração forçada de senha`);
  console.log('========================================================================');

  return { orgId, userId: user.id };
}

// Execução direta via CLI (npm run init:prod)
if (process.argv[1]?.includes('init-yeshua-production')) {
  initYeshuaProduction()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Init Yeshua Prod] ❌ Falha fatal na inicialização de produção:', err);
      process.exit(1);
    });
}
