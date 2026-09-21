import { prisma } from './prisma.client.js';
import crypto from 'crypto';

export async function seedYeshuaDemo() {
  console.log('--- [Seed Yeshua Demo] Iniciando provisionamento idempotente do tenant Yeshua Contabilidade ---');

  const demoEmail = 'demo@yeshuacontabilidade.com.br';
  const orgSlug = 'yeshua-contabilidade-demo';
  const orgName = 'Yeshua Contabilidade — Demo';

  // 1. Localiza ou cria o usuário Demo Yeshua
  let user = await prisma.user.findUnique({
    where: { email: demoEmail }
  });

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
    // Senha pré-definida: Yeshua2026!Demo
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        accountId: demoEmail,
        providerId: 'credential',
        password: '$2a$10$w8T0Gg2p/bUf2ZJm7QyvxeZ7u7hCj3.y8hY9J6YyC9yZ1.h7hG7Gy', // Hash compatível
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    console.log(`[Seed Yeshua] Usuário Demo criado: ${demoEmail}`);
  } else {
    console.log(`[Seed Yeshua] Usuário Demo existente reaproveitado: ${demoEmail}`);
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
            webhookVerifyToken: 'yeshua_demo_verify_token_2026'
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

  // 4. Clientes fictícios da Yeshua Contabilidade
  const clientsData = [
    {
      name: 'Roberto Silveira (TechSolutions LTDA)',
      phone: '11981112233',
      normalizedPhone: '+5511981112233',
      category: 'REFORMA_TRIBUTARIA',
      priority: 'MEDIUM',
      messageText: 'Olá equipe Yeshua! Nossa empresa de tecnologia é optante pelo Simples Nacional. Como fica nossa tributação com a transição do IBS/CBS da Reforma Tributária? Vamos perder benefícios fiscais?',
      aiReply: 'Olá, Roberto Silveira! No regime do Simples Nacional para TechSolutions Serviços de TI, a Reforma Tributária prevê regime de transição escalonado (IBS/CBS). Seus créditos e benefícios continuam assegurados na faixa atual. Elaboramos um resumo técnico detalhado que já está disponível em seu painel.',
      taskTitle: 'Pendência Contábil: Roberto Silveira (Reforma Tributária & Simples)',
      taskDesc: 'Assunto: Consulta sobre impacto da Reforma Tributária (IBS/CBS) e regras do Simples Nacional.\nAção Recomendada: Orientar regras de transição e cálculo comparativo de alíquotas.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Carla Dias (CD Consultoria MEI)',
      phone: '11982223344',
      normalizedPhone: '+5511982223344',
      category: 'MEI',
      priority: 'MEDIUM',
      messageText: 'Boa tarde! Fiz as contas do meu faturamento deste ano e ultrapassei os R$ 81.000,00 do MEI, fechando em R$ 98.000,00. Preciso desenquadrar agora para Microempresa? Como calcular a guia complementar?',
      aiReply: 'Olá, Carla Dias! Calculamos o percentual excedente do seu MEI (CD Consultoria). Como o faturamento ficou entre 20% e o limite de transição, efetuaremos o desenquadramento com vigência retroativa, emitindo a guia DAS proporcional para manter sua regularidade sem multas.',
      taskTitle: 'Pendência Contábil: Carla Dias (MEI & Desenquadramento)',
      taskDesc: 'Assunto: Excesso de limite de faturamento do MEI e necessidade de desenquadramento para Microempresa (ME).\nAção Recomendada: Calcular percentual de excesso e orientar desenquadramento voluntário.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Marcos Vinicius (LogExpress Transportes)',
      phone: '11983334455',
      normalizedPhone: '+5511983334455',
      category: 'NOTA_FISCAL',
      priority: 'HIGH',
      messageText: 'Preciso emitir urgentemente uma NFS-e de R$ 45.000,00 para um cliente corporativo de outro município com retenção de ISS e CSRF (PIS/COFINS/CSLL), mas o sistema da Prefeitura está travando no código de serviço.',
      aiReply: 'Olá, Marcos Vinicius! Para emissão de NFS-e com retenções para LogExpress Transportes & Logística, estamos conferindo o código de serviço municipal e alíquota de ISS aplicável. Nosso setor fiscal enviará o espelho correto em instantes.',
      taskTitle: 'Pendência Contábil: Marcos Vinicius (Emissão de Nota Fiscal & Retenções)',
      taskDesc: 'Assunto: Suporte urgente para emissão de nota fiscal de serviço/produto e retenções tributárias na fonte.\nAção Recomendada: Verificar código de serviço municipal e regras de retenção na fonte.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Pr. Josué Mendes (Comunidade da Fé Central)',
      phone: '11984445566',
      normalizedPhone: '+5511984445566',
      category: 'IMUNIDADE_TEMPLO',
      priority: 'HIGH',
      messageText: 'A paz de Cristo! Nossa Comunidade da Fé precisa renovar a Certidão Negativa de Débitos (CND) na Receita Federal e protocolar a declaração de imunidade constitucional de templos. Quais documentos vocês precisam?',
      aiReply: 'A paz, Pr. Josué Mendes! A Yeshua possui núcleo especializado em igrejas e terceiro setor. Para a renovação de CND e cumprimento das obrigações da Igreja Comunidade da Fé Central, solicitamos a ata de posse atualizada da diretoria para protocolo imediato.',
      taskTitle: 'Pendência Contábil: Pr. Josué Mendes (Igrejas & Terceiro Setor)',
      taskDesc: 'Assunto: Conformidade de entidade religiosa / terceiro setor, imunidade constitucional e emissão de CNDs.\nAção Recomendada: Orientar conformidade estatutária e certidões negativas de débito.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Dra. Helena Castro (BioFarma Distribuidora)',
      phone: '11985556677',
      normalizedPhone: '+5511985556677',
      category: 'CASO_COMPLEXO',
      priority: 'URGENT',
      messageText: 'Recebemos uma intimação da SEFAZ com prazo de 5 dias úteis alegando divergência de recolhimento de ICMS-ST e SPED Fiscal dos últimos 2 anos. O valor apontado é de R$ 140.000,00. Precisamos de defesa urgente!',
      aiReply: 'Prezada Dra. Helena Castro (BioFarma Distribuição de Medicamentos), acusamos o recebimento da notificação fiscal. Devido à criticidade do prazo da SEFAZ/Receita, nosso auditor tributário sênior já assumiu seu atendimento e entrará em contato em até 1 hora para protocolar a documentação necessária.',
      taskTitle: 'Pendência Contábil: Dra. Helena Castro (Caso Complexo / Fiscalização)',
      taskDesc: 'Assunto: Notificação de fiscalização tributária ou auto de infração com prazo pericial.\nAção Recomendada: Escalar imediatamente para auditor fiscal / contador sênior.',
      taskStatus: 'PENDING'
    },
    {
      name: 'Fernando Guimarães (Grupo Aliança)',
      phone: '11986667788',
      normalizedPhone: '+5511986667788',
      category: 'FALAR_CONTADOR',
      priority: 'HIGH',
      messageText: 'Olá! Gostaria de agendar uma reunião presencial com o contador responsável na Yeshua nesta semana. Estamos estruturando uma holding patrimonial familiar e abertura de filial.',
      aiReply: 'Olá, Fernando Guimarães! Perfeito. Encaminhamos sua solicitação à agenda do nosso contador responsável. Em instantes enviaremos os horários disponíveis para alinhamento estratégico da Grupo Aliança Empreendimentos.',
      taskTitle: 'Pendência Contábil: Fernando Guimarães (Falar com Contador Responsável)',
      taskDesc: 'Assunto: Solicitação de reunião consultiva ou planejamento societário com o contador responsável.\nAção Recomendada: Agendar horário com contador responsável e abrir canal direto.',
      taskStatus: 'COMPLETED'
    },
    {
      name: 'Amanda Prado (Studio Prado Arquitetura)',
      phone: '11987778899',
      normalizedPhone: '+5511987778899',
      category: 'GERAL_CONTABIL',
      priority: 'LOW',
      messageText: 'Bom dia! Gostaria de solicitar o fechamento da folha de pagamento deste mês e o comprovante do recolhimento de FGTS Digital dos estagiários.',
      aiReply: 'Olá, Amanda Prado! Recebemos sua solicitação de folha de pagamento e guias de FGTS Digital para Studio Prado Arquitetura. O checklist foi validado e os comprovantes estão disponíveis na pasta do cliente.',
      taskTitle: 'Pendência Contábil: Amanda Prado (Fechamento de Folha & FGTS)',
      taskDesc: 'Assunto: Envio de folha de pagamento e comprovantes de FGTS Digital.\nAção Recomendada: Gerar guias DAE/FGTS e disponibilizar no painel.',
      taskStatus: 'COMPLETED'
    },
    {
      name: 'Carlos Eduardo Ramos (Padaria Pão Real)',
      phone: '11988889900',
      normalizedPhone: '+5511988889900',
      category: 'GERAL_CONTABIL',
      priority: 'LOW',
      messageText: 'Boa tarde! Precisamos emitir o balancete patrimonial trimestral para renovação de linha de crédito bancário do BNDES.',
      aiReply: 'Olá, Carlos Eduardo Ramos! O balancete patrimonial trimestral da Padaria & Confeitaria Pão Real já foi assinado digitalmente pelo contador e enviado diretamente ao gerente do banco.',
      taskTitle: 'Pendência Contábil: Carlos Eduardo Ramos (Balancete Trimestral BNDES)',
      taskDesc: 'Assunto: Emissão de balancete contábil assinado para financiamento bancário.\nAção Recomendada: Emitir DRE e Balancete com termo de abertura.',
      taskStatus: 'COMPLETED'
    }
  ];

  for (const item of clientsData) {
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
          consentStatus: 'OPTED_IN',
          optOut: false
        }
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
