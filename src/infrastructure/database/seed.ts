import { prisma } from './prisma.client.js';

async function main() {
  console.log('[Seed] Iniciando população do banco de dados relacional...');

  // 1. Limpa registros anteriores de demonstração
  await prisma.followUpTask.deleteMany();
  await prisma.consentHistory.deleteMany();
  await prisma.aIAnalysis.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.person.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  // 2. Cria Usuário Administrador / Líder
  const user = await prisma.user.create({
    data: {
      name: 'Pastor Tiago Rocha',
      email: 'pastor@conecta.org',
      passwordHash: 'hash_demo_123456',
      role: 'ADMIN'
    }
  });

  // 3. Cria Evento de Demonstração
  const event = await prisma.event.create({
    data: {
      name: 'Culto de Domingo - Noite da Família',
      description: 'Encontro comunitário com celebração e acolhimento',
      eventDate: new Date('2026-08-23T19:00:00Z'),
      location: 'Templo Central - São Paulo/SP',
      totalAttendees: 4,
      totalAbsentees: 6,
      status: 'COMPLETED'
    }
  });

  // 4. Criação de 10 Pessoas com Telefones E.164 Válidos
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
        name: p.name,
        phone: p.phone,
        normalizedPhone: p.normalizedPhone,
        optOut: false,
        consentStatus: 'OPTED_IN',
        consentSource: 'SPREADSHEET_IMPORT'
      }
    });

    createdPersons[p.name] = person;

    await prisma.consentHistory.create({
      data: {
        personId: person.id,
        status: 'OPTED_IN',
        source: 'SPREADSHEET_IMPORT',
        reason: 'Importação inicial de lista de participantes'
      }
    });

    await prisma.attendance.create({
      data: {
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

  // 5. Cria Campanha de Disparo Pós-Evento para os 6 Ausentes
  const campaign = await prisma.campaign.create({
    data: {
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

  // 6. Registra Mensagens Enviadas (Outbound) e Respostas (Inbound) com Análise de IA

  // Caso 1: Mariana Souza (Saúde / Febre na UPA) -> Prioridade HIGH
  const pMariana = createdPersons['Mariana Souza'];
  const convMariana = await prisma.conversation.create({
    data: {
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
      personId: pMariana.id,
      conversationId: convMariana.id,
      title: 'Acompanhamento Pastoral: Mariana Souza (SAUDE)',
      description: 'Filha esteve na UPA com febre alta. Enviar mensagem de oração e verificar melhora.',
      priority: 'HIGH',
      status: 'PENDING'
    }
  });

  // Caso 2: Carlos Eduardo (Saúde / Crise e Pedido de Oração) -> Prioridade URGENT
  const pCarlos = createdPersons['Carlos Eduardo'];
  const convCarlos = await prisma.conversation.create({
    data: {
      personId: pCarlos.id,
      status: 'REPLIED',
      priority: 'URGENT',
      requiresHumanAttention: true,
      category: 'PEDIDO_ATENDIMENTO',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      conversationId: convCarlos.id,
      personId: pCarlos.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: `Olá, Carlos! Sentimos muito sua falta no Culto de Domingo - Noite da Família deste domingo. Está tudo bem com você e sua família?`,
      status: 'READ'
    }
  });

  const msgInCarlos = await prisma.message.create({
    data: {
      conversationId: convCarlos.id,
      personId: pCarlos.id,
      direction: 'INBOUND',
      content: 'Pastor, estou passando por uma fase muito difícil de luto e depressão profunda. Preciso de ajuda e oração urgente.',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      messageId: msgInCarlos.id,
      conversationId: convCarlos.id,
      category: 'PEDIDO_ATENDIMENTO',
      reason: 'Luto e depressão com solicitação de socorro pastoral',
      intent: 'PRAYER_REQUEST',
      confidence: 0.98,
      sentiment: 'PREOCUPADO',
      urgency: 'ALTA',
      priority: 'URGENT',
      summary: 'Membro em sofrimento emocional por luto e depressão, solicitando contato e oração imediatos.',
      requiresHumanAttention: true,
      suggestedReply: 'Olá, Carlos! Recebemos sua mensagem com muito carinho e já estamos em oração por você. O pastor Tiago entrará em contato direto ainda hoje. Você não está sozinho!',
      nextAction: 'PASTORAL_CONTACT',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  await prisma.followUpTask.create({
    data: {
      personId: pCarlos.id,
      conversationId: convCarlos.id,
      title: 'URGENTE: Contato Pastoral com Carlos Eduardo',
      description: 'Membro em luto e depressão solicitando oração e visita.',
      priority: 'URGENT',
      status: 'PENDING'
    }
  });

  // Caso 3: Rodrigo Lima (Trabalho / Plantão) -> Prioridade LOW
  const pRodrigo = createdPersons['Rodrigo Lima'];
  const convRodrigo = await prisma.conversation.create({
    data: {
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
      conversationId: convRodrigo.id,
      personId: pRodrigo.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: `Olá, Rodrigo! Sentimos muito sua falta no Culto de Domingo. Está tudo bem?`,
      status: 'READ'
    }
  });

  const msgInRodrigo = await prisma.message.create({
    data: {
      conversationId: convRodrigo.id,
      personId: pRodrigo.id,
      direction: 'INBOUND',
      content: 'Boa noite! Peguei escala de plantão extra na empresa e trabalhei até tarde.',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      messageId: msgInRodrigo.id,
      conversationId: convRodrigo.id,
      category: 'TRABALHO',
      intent: 'JUSTIFY_ABSENCE',
      confidence: 0.92,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      summary: 'Ausência devido a escala de plantão profissional extra.',
      requiresHumanAttention: false,
      suggestedReply: 'Olá, Rodrigo! Entendemos perfeitamente. Que Deus abençoe seu trabalho e sua escala! Esperamos você no próximo domingo!',
      nextAction: 'REPLY_IMMEDIATELY',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  // Caso 4: Fernanda Costa (Trabalho / Turno Noturno) -> Prioridade LOW
  const pFernanda = createdPersons['Fernanda Costa'];
  const convFernanda = await prisma.conversation.create({
    data: {
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
      conversationId: convFernanda.id,
      personId: pFernanda.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: `Olá, Fernanda! Sentimos muito sua falta no Culto de Domingo.`,
      status: 'READ'
    }
  });

  const msgInFernanda = await prisma.message.create({
    data: {
      conversationId: convFernanda.id,
      personId: pFernanda.id,
      direction: 'INBOUND',
      content: 'Olá! Estava trabalhando no turno da noite do hospital.',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      messageId: msgInFernanda.id,
      conversationId: convFernanda.id,
      category: 'TRABALHO',
      intent: 'JUSTIFY_ABSENCE',
      confidence: 0.90,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      summary: 'Turno noturno no hospital.',
      requiresHumanAttention: false,
      suggestedReply: 'Olá, Fernanda! Que Deus abençoe sua vocação e trabalho na saúde! Sentimos sua falta e te esperamos no próximo encontro!',
      nextAction: 'REPLY_IMMEDIATELY',
      modelUsed: 'GEMINI (gemini-2.0-flash)'
    }
  });

  // Caso 5: Paulo Ricardo (Ambíguo / "👍 ok") -> Prioridade MEDIUM
  const pPaulo = createdPersons['Paulo Ricardo'];
  const convPaulo = await prisma.conversation.create({
    data: {
      personId: pPaulo.id,
      status: 'REPLIED',
      priority: 'MEDIUM',
      requiresHumanAttention: true,
      category: 'INCONCLUSIVO',
      lastMessageAt: new Date()
    }
  });

  await prisma.message.create({
    data: {
      conversationId: convPaulo.id,
      personId: pPaulo.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: `Olá, Paulo! Sentimos muito sua falta no Culto de Domingo. Está tudo bem?`,
      status: 'READ'
    }
  });

  const msgInPaulo = await prisma.message.create({
    data: {
      conversationId: convPaulo.id,
      personId: pPaulo.id,
      direction: 'INBOUND',
      content: '👍 ok valeu',
      status: 'READ'
    }
  });

  await prisma.aIAnalysis.create({
    data: {
      messageId: msgInPaulo.id,
      conversationId: convPaulo.id,
      category: 'INCONCLUSIVO',
      intent: 'GREETING',
      confidence: 0.35,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'MEDIUM',
      summary: 'Resposta vaga com emoji e agradecimento monossilábico sem motivo informado.',
      requiresHumanAttention: true,
      suggestedReply: 'Olá, Paulo! Obrigado pelo retorno. Esperamos que esteja tudo ótimo por aí! Qualquer coisa estamos à disposição!',
      nextAction: 'REQUEST_CLARIFICATION',
      modelUsed: 'RULE_BASED_FALLBACK'
    }
  });

  // Caso 6: Carla Nogueira (Opt-Out / "SAIR") -> Bloqueada LGPD
  const pCarla = createdPersons['Carla Nogueira'];
  await prisma.person.update({
    where: { id: pCarla.id },
    data: {
      optOut: true,
      consentStatus: 'OPTED_OUT',
      optOutReason: 'Solicitou descadastro via mensagem "SAIR"',
      optOutAt: new Date()
    }
  });

  await prisma.consentHistory.create({
    data: {
      personId: pCarla.id,
      status: 'OPTED_OUT',
      reason: 'Comando de cancelamento "SAIR" recebido',
      source: 'WEBHOOK_KEYWORD'
    }
  });

  const convCarla = await prisma.conversation.create({
    data: {
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
      conversationId: convCarla.id,
      personId: pCarla.id,
      campaignId: campaign.id,
      direction: 'OUTBOUND',
      content: `Olá, Carla! Sentimos muito sua falta no Culto de Domingo.`,
      status: 'READ'
    }
  });

  await prisma.message.create({
    data: {
      conversationId: convCarla.id,
      personId: pCarla.id,
      direction: 'INBOUND',
      content: 'SAIR',
      status: 'READ'
    }
  });

  console.log('[Seed] População de dados concluída com sucesso!');
  console.log(`[Seed] 10 Pessoas cadastradas (4 Presentes, 6 Ausentes com respostas reais e IA classificada).`);
}

main()
  .catch((e) => {
    console.error('[Seed] Erro ao popular banco:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
