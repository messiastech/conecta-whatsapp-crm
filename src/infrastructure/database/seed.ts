import { prisma } from './prisma.client.js';

async function main() {
  console.log('[Seed] Iniciando população do banco de dados relacional multi-tenant...');

  // 1. Limpa registros anteriores
  await prisma.followUpTask.deleteMany();
  await prisma.consentHistory.deleteMany();
  await prisma.aIAnalysis.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.person.deleteMany();
  await prisma.event.deleteMany();
  await prisma.organizationSettings.deleteMany();
  await prisma.whatsAppConnection.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.member.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Cria Usuário Administrador de Demonstração
  const demoUser = await prisma.user.create({
    data: {
      name: 'Pastor Tiago Rocha',
      email: 'demo@conecta.crm',
      emailVerified: true
    }
  });

  // 3. Cria "Workspace Demonstração"
  const demoOrg = await prisma.organization.create({
    data: {
      name: 'Workspace Demonstração',
      slug: 'workspace-demonstracao',
      members: {
        create: {
          userId: demoUser.id,
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
          status: 'CONNECTED',
          webhookVerifyToken: 'conecta_webhook_token_secret_2026'
        }
      }
    }
  });

  console.log(`[Seed] Organização criada: ${demoOrg.name} (${demoOrg.id})`);

  // 4. Cria Evento no Workspace Demonstração
  const event = await prisma.event.create({
    data: {
      organizationId: demoOrg.id,
      name: 'Culto de Domingo - Noite da Família',
      description: 'Encontro comunitário com celebração e acolhimento',
      eventDate: new Date('2026-08-23T19:00:00Z'),
      location: 'Templo Central - São Paulo/SP',
      totalAttendees: 4,
      totalAbsentees: 6,
      status: 'COMPLETED'
    }
  });

  // 5. Criação de 10 Pessoas com Telefones E.164 Válidos
  const peopleData = [
    // 4 Presentes
    { name: 'Lucas Ferreira', phone: '(11) 98111-0001', normalizedPhone: '+5511981110001', attended: true },
    { name: 'Beatriz Almeida', phone: '(11) 98111-0002', normalizedPhone: '+5511981110002', attended: true },
    { name: 'Gabriel Santos', phone: '(11) 98111-0003', normalizedPhone: '+5511981110003', attended: true },
    { name: 'Juliana Mendes', phone: '(11) 98111-0004', normalizedPhone: '+5511981110004', attended: true },

    // 6 Ausentes
    { name: 'Mariana Souza', phone: '(11) 98765-4321', normalizedPhone: '+5511987654321', attended: false }, // Saúde
    { name: 'Carlos Eduardo', phone: '(11) 98111-0005', normalizedPhone: '+5511981110005', attended: false }, // Saúde
    { name: 'Rodrigo Lima', phone: '(11) 98111-0006', normalizedPhone: '+5511981110006', attended: false },   // Trabalho
    { name: 'Fernanda Costa', phone: '(11) 98111-0007', normalizedPhone: '+5511981110007', attended: false }, // Trabalho
    { name: 'Paulo Ricardo', phone: '(11) 98111-0008', normalizedPhone: '+5511981110008', attended: false },  // Ambíguo
    { name: 'Carla Nogueira', phone: '(11) 98111-0009', normalizedPhone: '+5511981110009', attended: false }  // Opt-out
  ];

  const createdPersons: Record<string, any> = {};

  for (const p of peopleData) {
    const person = await prisma.person.create({
      data: {
        organizationId: demoOrg.id,
        name: p.name,
        phone: p.phone,
        normalizedPhone: p.normalizedPhone,
        optOut: p.name === 'Carla Nogueira',
        optOutAt: p.name === 'Carla Nogueira' ? new Date() : null,
        optOutReason: p.name === 'Carla Nogueira' ? 'Solicitou descadastramento via WhatsApp' : null,
        consentStatus: p.name === 'Carla Nogueira' ? 'OPTED_OUT' : 'OPTED_IN',
        consentSource: 'SPREADSHEET_IMPORT'
      }
    });

    createdPersons[p.name] = person;

    await prisma.consentHistory.create({
      data: {
        organizationId: demoOrg.id,
        personId: person.id,
        status: p.name === 'Carla Nogueira' ? 'OPTED_OUT' : 'OPTED_IN',
        source: 'SPREADSHEET_IMPORT',
        reason: 'Importação inicial de lista de participantes'
      }
    });

    await prisma.attendance.create({
      data: {
        organizationId: demoOrg.id,
        personId: person.id,
        eventId: event.id,
        invited: true,
        confirmed: true,
        attended: p.attended,
        status: p.attended ? 'ATTENDED' : 'ABSENT',
        source: 'CSV_IMPORT'
      }
    });
  }

  // 6. Cria Campanha de Disparo Pós-Evento para os 6 Ausentes
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: demoOrg.id,
      eventId: event.id,
      name: 'Follow-up Ausentes: Culto da Família',
      type: 'AUSENTE_FOLLOWUP',
      templateName: 'pos_evento_ausente_v1',
      messageBody: 'Olá, {{nome}}! Sentimos muito sua falta no {{evento}} deste domingo. Está tudo bem com você e sua família?',
      status: 'COMPLETED',
      totalRecipients: 6,
      totalSent: 6,
      totalDelivered: 6,
      totalFailed: 0
    }
  });

  // 7. Registra Mensagens e Interações para os Ausentes
  // Caso 1: Mariana Souza (Saúde / UPA) -> Prioridade HIGH
  const pMariana = createdPersons['Mariana Souza'];
  const convMariana = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      personId: pMariana.id,
      status: 'REPLIED',
      priority: 'HIGH',
      requiresHumanAttention: true,
      category: 'SAUDE',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convMariana.id,
      personId: pMariana.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: `Olá, Mariana! Sentimos muito sua falta no Culto de Domingo - Noite da Família deste domingo. Está tudo bem com você e sua família?`,
      status: 'READ',
      sentAt: new Date(Date.now() - 3600000 * 4),
      deliveredAt: new Date(Date.now() - 3600000 * 4 + 2000),
      readAt: new Date(Date.now() - 3600000 * 3)
    }
  });

  const msgInMariana = await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convMariana.id,
      personId: pMariana.id,
      direction: 'INBOUND',
      content: 'Oi pastor! Não consegui ir porque minha filha teve febre muito alta e passei a noite com ela na UPA.',
      status: 'READ',
      deliveredAt: new Date(Date.now() - 3600000 * 2),
      readAt: new Date(Date.now() - 3600000 * 2)
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      organizationId: demoOrg.id,
      messageId: msgInMariana.id,
      conversationId: convMariana.id,
      category: 'SAUDE',
      reason: 'Filha com febre alta e atendimento na UPA',
      intent: 'JUSTIFY_ABSENCE',
      confidence: 0.94,
      sentiment: 'PREOCUPADO',
      urgency: 'MEDIA',
      priority: 'HIGH',
      summary: 'Ausência motivada por febre alta da filha com atendimento hospitalar na UPA.',
      requiresHumanAttention: true,
      suggestedReply: 'Olá, Mariana! Sentimos muito por isso. Desejamos uma recuperação rápida e plena para sua filha! Que Deus renove suas forças. Se precisar de algo, conte conosco!',
      nextAction: 'REQUIRE_HUMAN_APPROVAL',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  await prisma.followUpTask.create({
    data: {
      organizationId: demoOrg.id,
      personId: pMariana.id,
      conversationId: convMariana.id,
      title: 'Acompanhamento Pastoral: Mariana Souza (SAUDE)',
      description: 'Filha esteve na UPA com febre alta. Enviar mensagem de oração e verificar melhora.',
      priority: 'HIGH',
      status: 'PENDING'
    }
  });

  // Caso 2: Carlos Eduardo (Saúde)
  const pCarlos = createdPersons['Carlos Eduardo'];
  const convCarlos = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      personId: pCarlos.id,
      status: 'REPLIED',
      priority: 'HIGH',
      requiresHumanAttention: true,
      category: 'SAUDE',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convCarlos.id,
      personId: pCarlos.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: 'Olá Carlos, sentimos sua falta!',
      status: 'READ'
    }
  });

  const msgInCarlos = await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convCarlos.id,
      personId: pCarlos.id,
      direction: 'INBOUND',
      content: 'Tive uma crise forte de coluna e não consegui sair da cama ontem.',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      organizationId: demoOrg.id,
      messageId: msgInCarlos.id,
      conversationId: convCarlos.id,
      category: 'SAUDE',
      confidence: 0.92,
      sentiment: 'PREOCUPADO',
      urgency: 'ALTA',
      priority: 'HIGH',
      summary: 'Crise de coluna impossibilitando locomoção.',
      requiresHumanAttention: true,
      suggestedReply: 'Estimado Carlos, sentimos muito pela dor! Estamos orando pela sua recuperação. Fique em repouso e que Deus te restaure logo.',
      nextAction: 'PASTORAL_CONTACT',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  await prisma.followUpTask.create({
    data: {
      organizationId: demoOrg.id,
      personId: pCarlos.id,
      conversationId: convCarlos.id,
      title: 'Acompanhamento Pastoral: Carlos Eduardo (SAUDE)',
      description: 'Crise de coluna. Verificar se precisa de ajuda prática ou visita.',
      priority: 'HIGH',
      status: 'PENDING'
    }
  });

  // Caso 3: Rodrigo Lima (Trabalho / Plantão)
  const pRodrigo = createdPersons['Rodrigo Lima'];
  const convRodrigo = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      personId: pRodrigo.id,
      status: 'REPLIED',
      priority: 'LOW',
      requiresHumanAttention: false,
      category: 'TRABALHO',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convRodrigo.id,
      personId: pRodrigo.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: 'Olá Rodrigo, sentimos sua falta!',
      status: 'READ'
    }
  });

  const msgInRodrigo = await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convRodrigo.id,
      personId: pRodrigo.id,
      direction: 'INBOUND',
      content: 'Estava de plantão no hospital ontem à noite, não deu pra ir.',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      organizationId: demoOrg.id,
      messageId: msgInRodrigo.id,
      conversationId: convRodrigo.id,
      category: 'TRABALHO',
      confidence: 0.95,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      summary: 'Ausência justificada por plantão de trabalho hospitalar.',
      requiresHumanAttention: false,
      suggestedReply: 'Que bênção seu trabalho, Rodrigo! Bom descanso do plantão e nos vemos no próximo culto.',
      nextAction: 'REPLY_IMMEDIATELY',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  // Caso 4: Fernanda Costa (Trabalho / Escala)
  const pFernanda = createdPersons['Fernanda Costa'];
  const convFernanda = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      personId: pFernanda.id,
      status: 'REPLIED',
      priority: 'LOW',
      requiresHumanAttention: false,
      category: 'TRABALHO',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convFernanda.id,
      personId: pFernanda.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: 'Olá Fernanda, sentimos sua falta!',
      status: 'READ'
    }
  });

  const msgInFernanda = await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convFernanda.id,
      personId: pFernanda.id,
      direction: 'INBOUND',
      content: 'Estava escalada no trabalho.',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      organizationId: demoOrg.id,
      messageId: msgInFernanda.id,
      conversationId: convFernanda.id,
      category: 'TRABALHO',
      confidence: 0.9,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      summary: 'Escala de trabalho.',
      requiresHumanAttention: false,
      suggestedReply: 'Entendido, Fernanda! Bom trabalho e ótima semana!',
      nextAction: 'REPLY_IMMEDIATELY',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  // Caso 5: Paulo Ricardo (Ambíguo)
  const pPaulo = createdPersons['Paulo Ricardo'];
  const convPaulo = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      personId: pPaulo.id,
      status: 'REPLIED',
      priority: 'MEDIUM',
      requiresHumanAttention: false,
      category: 'INCONCLUSIVO',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convPaulo.id,
      personId: pPaulo.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: 'Olá Paulo, sentimos sua falta!',
      status: 'READ'
    }
  });

  const msgInPaulo = await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convPaulo.id,
      personId: pPaulo.id,
      direction: 'INBOUND',
      content: 'Não deu...',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      organizationId: demoOrg.id,
      messageId: msgInPaulo.id,
      conversationId: convPaulo.id,
      category: 'INCONCLUSIVO',
      confidence: 0.6,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'MEDIUM',
      summary: 'Resposta curta e vaga ("Não deu...").',
      requiresHumanAttention: false,
      suggestedReply: 'Sem problemas, Paulo! Esperamos te ver em breve. Tenha uma ótima semana!',
      nextAction: 'REQUEST_CLARIFICATION',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  // Caso 6: Carla Nogueira (Opt-Out)
  const pCarla = createdPersons['Carla Nogueira'];
  const convCarla = await prisma.conversation.create({
    data: {
      organizationId: demoOrg.id,
      personId: pCarla.id,
      status: 'CLOSED',
      priority: 'LOW',
      requiresHumanAttention: false,
      category: 'OPT_OUT',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convCarla.id,
      personId: pCarla.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: 'Olá Carla, sentimos sua falta!',
      status: 'READ'
    }
  });

  await prisma.message.create({
    data: {
      organizationId: demoOrg.id,
      conversationId: convCarla.id,
      personId: pCarla.id,
      direction: 'INBOUND',
      content: 'Por favor, pare de me mandar mensagens.',
      status: 'READ'
    }
  });

  console.log('[Seed] População concluída com sucesso!');
  console.log(`[Seed] Workspace: "${demoOrg.name}" (${demoOrg.id})`);
  console.log(`[Seed] 10 Pessoas cadastradas (4 Presentes, 6 Ausentes com IA, 2 Follow-ups e 1 Opt-Out).`);
}

main()
  .catch(err => {
    console.error('[Seed] Erro ao popular banco:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
