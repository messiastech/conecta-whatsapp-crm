import { prisma } from './prisma.client.js';
import { hashPassword } from 'better-auth/crypto';
import crypto from 'crypto';

export async function seedYeshuaDemo() {
  console.log('--- [Seed Yeshua Demo] Iniciando provisionamento idempotente do tenant Yeshua Contabilidade ---');

  const demoEmail = process.env.YESHUA_DEMO_EMAIL || 'demo@yeshuacontabilidade.com.br';
  const orgSlug = 'yeshua-contabilidade-demo';
  const orgName = 'Yeshua Contabilidade — Demo';
  const demoPassword = process.env.YESHUA_DEMO_PASSWORD || 'demo';

  // 1. Localiza ou cria o usuário Demo Yeshua
  let user = await prisma.user.findUnique({
    where: { email: demoEmail }
  });

  const hashedPassword = await hashPassword(demoPassword);

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: 'Equipe Yeshua Contábil',
        email: demoEmail,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Cria conta de autenticação por e-mail/senha no Better Auth
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
    console.log(`[Seed Yeshua] Usuário Demo criado: ${demoEmail}`);
  } else {
    // Atualiza a credencial para garantir a sincronia com a senha da demo e accountId correto
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
    console.log(`[Seed Yeshua] Usuário Demo existente reaproveitado e credenciais sincronizadas: ${demoEmail}`);
  }

  // 2. Localiza ou cria o Workspace Yeshua Contabilidade com Perfil ACCOUNTING
  const metadata = JSON.stringify({
    verticalProfile: 'ACCOUNTING',
    brandName: 'YESHUA AI CLIENT DESK',
    brandSubtitle: 'powered by MEGA CORE',
    description: 'Assessoria Contábil, Tributária e Consultiva Especializada'
  });

  let org = await prisma.organization.findUnique({
    where: { slug: orgSlug }
  });

  const secureVerifyToken = process.env.WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(24).toString('hex');

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
            aiProvider: 'LOCAL_FALLBACK'
          }
        },
        whatsAppConnection: {
          create: {
            isMock: true,
            status: 'CONNECTED',
            webhookVerifyToken: secureVerifyToken
          }
        }
      }
    });
    console.log(`[Seed Yeshua] Organização criada: ${orgName} (${org.id})`);
  } else {
    org = await prisma.organization.update({
      where: { id: org.id },
      data: {
        name: orgName,
        metadata
      }
    });
    console.log(`[Seed Yeshua] Organização atualizada: ${orgName} (${org.id})`);
  }

  const orgId = org.id;

  // 3. Garante que o usuário é OWNER da organização
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
    console.log(`[Seed Yeshua] Usuário associado como OWNER`);
  }

  const DISCLAIMER = '\n\n[Resposta sugerida — sujeita à validação da equipe Yeshua]';

  // 4. Clientes fictícios da Yeshua Contabilidade (Contexto individual desacoplado do tenant)
  const clientsData = [
    {
      name: 'Roberto Silveira (TechSolutions LTDA)',
      clientName: 'Roberto Silveira',
      companyName: 'TechSolutions LTDA',
      activity: 'Serviços de TI',
      phone: '11981112233',
      normalizedPhone: '+5511981112233',
      category: 'REFORMA_TRIBUTARIA',
      priority: 'MEDIUM',
      messageText: 'Olá equipe Yeshua! Nossa empresa de tecnologia é optante pelo Simples Nacional. Como fica nossa tributação com a transição do IBS/CBS da Reforma Tributária? Vamos perder benefícios fiscais?',
      aiReply: `Olá, Roberto Silveira! No regime do Simples Nacional para TechSolutions LTDA, a Reforma Tributária prevê período de transição escalonado (IBS/CBS) com manutenção dos tratamentos favorecidos. Disponibilizamos orientações técnicas gerais e podemos analisar particularidades da sua atividade.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Roberto Silveira (Reforma Tributária & Simples)',
      taskDesc: 'Assunto: Consulta sobre impacto da Reforma Tributária (IBS/CBS) e regras do Simples Nacional.\nAção Recomendada: Orientar regras de transição e cálculo comparativo de alíquotas.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Carla Dias (CD Consultoria MEI)',
      clientName: 'Carla Dias',
      companyName: 'CD Consultoria',
      activity: 'Consultoria Empresarial',
      phone: '11982223344',
      normalizedPhone: '+5511982223344',
      category: 'MEI',
      priority: 'MEDIUM',
      messageText: 'Boa tarde! Fiz as contas do meu faturamento deste ano e ultrapassei os R$ 81.000,00 do MEI, fechando em R$ 98.000,00. Preciso desenquadrar agora para Microempresa? Como calcular a guia complementar?',
      aiReply: `Olá, Carla Dias! Identificamos sua dúvida quanto ao limite de faturamento do MEI (CD Consultoria). Caso o excesso ultrapasse os R$ 81 mil anuais, a equipe Yeshua analisará o percentual excedente para indicar o enquadramento adequado e as guias devidas.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Carla Dias (MEI & Desenquadramento)',
      taskDesc: 'Assunto: Excesso de limite de faturamento do MEI e necessidade de desenquadramento para Microempresa (ME).\nAção Recomendada: Calcular percentual de excesso e orientar desenquadramento voluntário.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Marcos Vinicius (LogExpress Transportes)',
      clientName: 'Marcos Vinicius',
      companyName: 'LogExpress Transportes',
      activity: 'Transporte e Logística',
      phone: '11983334455',
      normalizedPhone: '+5511983334455',
      category: 'NOTA_FISCAL',
      priority: 'HIGH',
      messageText: 'Preciso emitir urgentemente uma NFS-e de R$ 45.000,00 para um cliente corporativo de outro município com retenção de ISS e CSRF (PIS/COFINS/CSLL), mas o sistema da Prefeitura está travando no código de serviço.',
      aiReply: `Olá, Marcos Vinicius! Recebemos sua dúvida sobre emissão de nota fiscal e retenções na fonte para LogExpress Transportes. Nossa equipe fiscal está conferindo o código de serviço municipal e alíquotas aplicáveis para orientar o procedimento.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Marcos Vinicius (Emissão de Nota Fiscal & Retenções)',
      taskDesc: 'Assunto: Suporte urgente para emissão de nota fiscal de serviço/produto e retenções tributárias na fonte.\nAção Recomendada: Verificar código de serviço municipal e regras de retenção na fonte.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Pr. Josué Mendes (Comunidade da Fé Central)',
      clientName: 'Pr. Josué Mendes',
      companyName: 'Comunidade da Fé Central',
      activity: 'Organização Religiosa / Terceiro Setor',
      phone: '11984445566',
      normalizedPhone: '+5511984445566',
      category: 'IMUNIDADE_TEMPLO',
      priority: 'HIGH',
      messageText: 'A paz de Cristo! Nossa Comunidade da Fé precisa renovar a Certidão Negativa de Débitos (CND) na Receita Federal e protocolar a declaração de imunidade constitucional de templos. Quais documentos vocês precisam?',
      aiReply: `A paz, Pr. Josué Mendes! A Yeshua possui núcleo dedicado a entidades religiosas e terceiro setor. Para análise da regularidade cadastral e emissão de CNDs da Comunidade da Fé Central, por favor disponibilize a ata de posse vigente para conferência da diretoria.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Pr. Josué Mendes (Igrejas & Terceiro Setor)',
      taskDesc: 'Assunto: Conformidade de entidade religiosa / terceiro setor, imunidade constitucional e emissão de CNDs.\nAção Recomendada: Orientar conformidade estatutária e certidões negativas de débito.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Dra. Helena Castro (BioFarma Distribuidora)',
      clientName: 'Dra. Helena Castro',
      companyName: 'BioFarma Distribuidora',
      activity: 'Distribuição Farmacêutica',
      phone: '11985556677',
      normalizedPhone: '+5511985556677',
      category: 'CASO_COMPLEXO',
      priority: 'URGENT',
      messageText: 'Recebemos uma intimação da SEFAZ com prazo de 5 dias úteis alegando divergência de recolhimento de ICMS-ST e SPED Fiscal dos últimos 2 anos. O valor apontado é de R$ 140.000,00. Precisamos de defesa urgente!',
      aiReply: `Prezada Dra. Helena Castro (BioFarma Distribuidora), acusamos o recebimento do relato sobre a notificação fiscal. Devido à criticidade do prazo da SEFAZ/Receita, seu atendimento foi registrado para triagem prioritária da equipe técnica Yeshua para conferência documental.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Dra. Helena Castro (Caso Complexo / Fiscalização)',
      taskDesc: 'Assunto: Notificação de fiscalização tributária ou auto de infração com prazo pericial.\nAção Recomendada: Escalar imediatamente para auditor fiscal / contador sênior.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Fernando Guimarães (Grupo Aliança)',
      clientName: 'Fernando Guimarães',
      companyName: 'Grupo Aliança',
      activity: 'Holding e Empreendimentos',
      phone: '11986667788',
      normalizedPhone: '+5511986667788',
      category: 'FALAR_CONTADOR',
      priority: 'HIGH',
      messageText: 'Olá! Gostaria de agendar uma reunião presencial com o contador responsável na Yeshua nesta semana. Estamos estruturando uma holding patrimonial familiar e abertura de filial.',
      aiReply: `Olá, Fernando Guimarães! Registramos seu interesse em agendamento consultivo para Grupo Aliança. Nossa equipe verificará a disponibilidade da agenda do contador responsável para propor os horários disponíveis.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Fernando Guimarães (Falar com Contador Responsável)',
      taskDesc: 'Assunto: Solicitação de reunião consultiva ou planejamento societário com o contador responsável.\nAção Recomendada: Agendar horário com contador responsável e abrir canal direto.',
      taskStatus: 'COMPLETED'
    },
    {
      name: 'Amanda Prado (Studio Prado Arquitetura)',
      clientName: 'Amanda Prado',
      companyName: 'Studio Prado Arquitetura',
      activity: 'Serviços de Arquitetura',
      phone: '11987778899',
      normalizedPhone: '+5511987778899',
      category: 'GERAL_CONTABIL',
      priority: 'LOW',
      messageText: 'Bom dia! Gostaria de solicitar o fechamento da folha de pagamento deste mês e o comprovante do recolhimento de FGTS Digital dos estagiários.',
      aiReply: `Olá, Amanda Prado! Recebemos sua mensagem na Yeshua Contabilidade. Nossa equipe registrará a solicitação para Studio Prado Arquitetura e entrará em contato com as orientações pertinentes.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Amanda Prado (Fechamento de Folha & FGTS)',
      taskDesc: 'Assunto: Envio de folha de pagamento e comprovantes de FGTS Digital.\nAção Recomendada: Gerar guias DAE/FGTS e disponibilizar no painel.',
      taskStatus: 'COMPLETED'
    },
    {
      name: 'Carlos Eduardo Ramos (Padaria Pão Real)',
      clientName: 'Carlos Eduardo Ramos',
      companyName: 'Padaria Pão Real',
      activity: 'Comércio de Alimentos',
      phone: '11988889900',
      normalizedPhone: '+5511988889900',
      category: 'GERAL_CONTABIL',
      priority: 'LOW',
      messageText: 'Boa tarde! Precisamos emitir o balancete patrimonial trimestral para renovação de linha de crédito bancário do BNDES.',
      aiReply: `Olá, Carlos Eduardo Ramos! Recebemos sua mensagem na Yeshua Contabilidade. Nossa equipe registrará a solicitação para Padaria Pão Real e entrará em contato com as orientações pertinentes.${DISCLAIMER}`,
      taskTitle: 'Pendência Contábil: Carlos Eduardo Ramos (Balancete Trimestral BNDES)',
      taskDesc: 'Assunto: Emissão de balancete contábil assinado para financiamento bancário.\nAção Recomendada: Emitir DRE e Balancete com termo de abertura.',
      taskStatus: 'COMPLETED'
    }
  ];

  for (const item of clientsData) {
    const clientNotes = JSON.stringify({
      clientName: item.clientName,
      companyName: item.companyName,
      activity: item.activity
    });

    // 4.1 Cria ou localiza o cliente (Person)
    let person = await prisma.person.findUnique({
      where: {
        organizationId_normalizedPhone: {
          organizationId: orgId,
          normalizedPhone: item.normalizedPhone
        }
      }
    });

    if (!person) {
      person = await prisma.person.create({
        data: {
          organizationId: orgId,
          name: item.name,
          phone: item.phone,
          normalizedPhone: item.normalizedPhone,
          notes: clientNotes,
          consentStatus: 'OPTED_IN',
          optOut: false
        }
      });
    } else {
      person = await prisma.person.update({
        where: { id: person.id },
        data: { notes: clientNotes }
      });
    }

    // 4.2 Cria ou localiza a conversa (Conversation)
    let conv = await prisma.conversation.findFirst({
      where: {
        organizationId: orgId,
        personId: person.id
      }
    });

    if (!conv) {
      conv = await prisma.conversation.create({
        data: {
          organizationId: orgId,
          personId: person.id,
          status: 'REPLIED',
          category: item.category,
          priority: item.priority,
          requiresHumanAttention: item.priority === 'HIGH' || item.priority === 'URGENT',
          lastMessageAt: new Date()
        }
      });

      // 4.3 Cria mensagem Inbound do cliente
      const inMsg = await prisma.message.create({
        data: {
          organizationId: orgId,
          conversationId: conv.id,
          personId: person.id,
          direction: 'INBOUND',
          content: item.messageText,
          status: 'READ',
          deliveredAt: new Date(Date.now() - 3600000),
          readAt: new Date(Date.now() - 3500000),
          createdAt: new Date(Date.now() - 3600000)
        }
      });

      // 4.4 Cria Análise de IA vinculada
      await prisma.aIAnalysis.create({
        data: {
          organizationId: orgId,
          messageId: inMsg.id,
          conversationId: conv.id,
          category: item.category,
          reason: item.messageText,
          intent: 'ACCOUNTING_SERVICE_INQUIRY',
          confidence: 0.95,
          sentiment: item.priority === 'URGENT' ? 'CRITICO' : 'NEUTRO',
          urgency: item.priority === 'URGENT' ? 'CRITICA' : 'MEDIA',
          priority: item.priority,
          summary: item.taskDesc.split('\n')[0],
          requiresHumanAttention: item.priority === 'HIGH' || item.priority === 'URGENT',
          suggestedReply: item.aiReply,
          nextAction: 'REPLY_OPERATIONAL_CHECKLIST',
          modelUsed: 'YESHUA_ACCOUNTING_AI',
          rawResponse: JSON.stringify({ category: item.category, priority: item.priority })
        }
      });

      // 4.5 Cria resposta Outbound da Yeshua
      await prisma.message.create({
        data: {
          organizationId: orgId,
          conversationId: conv.id,
          personId: person.id,
          direction: 'OUTBOUND',
          content: item.aiReply,
          status: 'READ',
          sentAt: new Date(Date.now() - 3000000),
          deliveredAt: new Date(Date.now() - 2950000),
          readAt: new Date(Date.now() - 2900000),
          createdAt: new Date(Date.now() - 3000000)
        }
      });

      // 4.6 Cria Tarefa / Pendência Contábil
      await prisma.followUpTask.create({
        data: {
          organizationId: orgId,
          personId: person.id,
          conversationId: conv.id,
          title: item.taskTitle,
          description: item.taskDesc,
          priority: item.priority,
          status: item.taskStatus,
          createdAt: new Date(Date.now() - 3500000)
        }
      });
    }
  }

  console.log(`[Seed Yeshua] Provisionamento concluído com sucesso:`);
  console.log(`  - 8 Clientes cadastrados`);
  console.log(`  - 8 Conversas e Atendimentos triados pela IA`);
  console.log(`  - Pendências e Alertas fiscais configurados`);
  console.log(`--- [Seed Yeshua Demo] FIM DO SEED ---`);
}

// Execução direta via CLI (npm run seed:yeshua-demo)
if (process.argv[1]?.includes('seed-yeshua-demo')) {
  seedYeshuaDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed Yeshua] Falha fatal no seed:', err);
      process.exit(1);
    });
}
