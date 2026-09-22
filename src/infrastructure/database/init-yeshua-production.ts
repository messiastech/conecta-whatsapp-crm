import { prisma } from './prisma.client.js';
import { hashPassword } from 'better-auth/crypto';
import crypto from 'crypto';

export async function initYeshuaProduction() {
  console.log('========================================================================');
  console.log(' 🚀 [Init Yeshua Prod] Iniciando provisionamento idempotente de produção');
  console.log('========================================================================');

  const adminEmail = process.env.YESHUA_ADMIN_EMAIL || 'admin@yeshuacontabilidade.com.br';
  const adminPassword = process.env.YESHUA_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'YeshuaAdmin2026!');

  if (!adminPassword) {
    throw new Error('[Init Yeshua Prod] FATAL: A variável YESHUA_ADMIN_PASSWORD é obrigatória em ambiente de produção.');
  }

  const orgSlug = 'yeshua-contabilidade-igrejas';
  const orgName = 'Yeshua Contabilidade — Gestão para Igrejas';

  // 1. Localiza ou cria o usuário Administrador de Produção
  let user = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  const hashedPassword = await hashPassword(adminPassword);

  if (!user) {
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

    // Cria conta de credencial no Better Auth
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
    console.log(`[Init Yeshua Prod] ✅ Usuário administrador criado: ${adminEmail}`);
  } else {
    // Sincroniza credencial existente
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' }
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          accountId: user.id,
          password: hashedPassword,
          updatedAt: new Date()
        }
      });
    } else {
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
    }
    console.log(`[Init Yeshua Prod] ✅ Usuário administrador existente sincronizado: ${adminEmail}`);
  }

  // 2. Localiza ou cria a Organização de Produção
  const metadata = JSON.stringify({
    verticalProfile: 'ACCOUNTING',
    brandName: 'YESHUA DESK IGREJAS',
    brandSubtitle: 'Contabilidade Especializada para Igrejas e Terceiro Setor',
    description: 'Gestão Contábil, Fiscal e Tributária Especializada para Igrejas e Organizações Religiosas'
  });

  let org = await prisma.organization.findFirst({
    where: {
      OR: [
        { slug: orgSlug },
        { name: orgName }
      ]
    },
    include: {
      settings: true,
      whatsAppConnection: true
    }
  });

  const secureVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(24).toString('hex');

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
        metadata,
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
        whatsAppConnection: true
      }
    });
    console.log(`[Init Yeshua Prod] ✅ Organização criada: ${orgName} (${org.id})`);
  } else {
    org = await prisma.organization.update({
      where: { id: org.id },
      data: {
        name: orgName,
        slug: orgSlug,
        metadata
      },
      include: {
        settings: true,
        whatsAppConnection: true
      }
    });
    console.log(`[Init Yeshua Prod] ✅ Organização atualizada com branding de produção: ${orgName} (${org.id})`);
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

  // 5. Garante associação do usuário como OWNER
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
  console.log(`  - Sem dados fictícios / Sem clientes fake / Sem conversas de sandbox`);
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
