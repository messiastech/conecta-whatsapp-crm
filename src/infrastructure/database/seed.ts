import { prisma } from './prisma.client.js';

async function main() {
  console.log('[Seed] Iniciando população do banco de dados...');

  // Limpa registros anteriores para seed limpo
  await prisma.aIAnalysis.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.person.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  // 1. Usuário Administrador
  const admin = await prisma.user.create({
    data: {
      name: 'Pastor Marcos Oliveira',
      email: 'admin@igrejaconecta.com',
      passwordHash: '$2b$12$eX4mpL3H4shP4ssw0rdS3cur31234567890abcdefghijklmnopqrst',
      role: 'ADMIN'
    }
  });

  // 2. Evento Principal
  const event = await prisma.event.create({
    data: {
      name: 'Culto de Celebração de Domingo',
      description: 'Culto especial de celebração, adoração e comunhão comunitária.',
      eventDate: new Date('2026-08-23T19:00:00-03:00'),
      location: 'Templo Principal - Av. das Nações, 1500',
      totalAttendees: 4,
      totalAbsentees: 6,
      status: 'COMPLETED'
    }
  });

  // 3. Contatos Presentes
  const presentes = [
    { name: 'Carlos Eduardo Santos', phone: '(11) 98111-2233', norm: '+5511981112233' },
    { name: 'Ana Paula Ferreira', phone: '(11) 98222-3344', norm: '+5511982223344' },
    { name: 'Lucas Gabriel Silveira', phone: '(21) 99333-4455', norm: '+5521993334455' },
    { name: 'Beatriz Almeida Costa', phone: '(31) 98444-5566', norm: '+5531984445566' }
  ];

  for (const p of presentes) {
    const person = await prisma.person.create({
      data: {
        name: p.name,
        phone: p.phone,
        normalizedPhone: p.norm,
        optOut: false
      }
    });

    await prisma.attendance.create({
      data: {
        personId: person.id,
        eventId: event.id,
        invited: true,
        attended: true,
        source: 'CSV_IMPORT'
      }
    });
  }

  // 4. Contatos Ausentes com cenários reais de justificativa
  const ausentesData = [
    {
      name: 'Mariana Souza Rocha',
      phone: '(11) 98765-4321',
      norm: '+5511987654321',
      replyText: 'Oi pastor! Infelizmente hoje não consegui ir, minha filha mais nova começou com uma febre alta agora à tarde e estou levando ela na UPA.',
      category: 'SAUDE',
      confidence: 0.94,
      sentiment: 'PREOCUPADO',
      urgency: 'MEDIA',
      summary: 'Filha com febre alta sendo levada ao pronto-socorro.',
      attention: true,
      suggestedReply: 'Olá, Mariana! Sentimos muito por isso. Desejamos melhoras rápidas para sua princesinha e que Deus renove a saúde dela. Qualquer coisa que precisar conte conosco!'
    },
    {
      name: 'Roberto Fernando Lima',
      phone: '(11) 97654-3210',
      norm: '+5511976543210',
      replyText: 'Boa noite! Peguei escala de plantão extra no hospital hoje e só saio amanhã às 7h. No próximo domingo estarei firme!',
      category: 'TRABALHO',
      confidence: 0.96,
      sentiment: 'POSITIVO',
      urgency: 'BAIXA',
      summary: 'Plantão extra de trabalho no hospital durante a noite.',
      attention: false,
      suggestedReply: 'Olá, Roberto! Que Deus abençoe seu plantão e seu trabalho hoje. Você fez falta, mas nos vemos no próximo domingo!'
    },
    {
      name: 'Juliana Mendes Duarte',
      phone: '(21) 98888-7766',
      norm: '+5521988887766',
      replyText: 'Irmão, estou passando por uma fase muito pesada na minha vida e na minha família, sinto muita angústia. Por favor orem por mim e se puderem me liguem.',
      category: 'PEDIDO_ATENDIMENTO',
      confidence: 0.98,
      sentiment: 'PREOCUPADO',
      urgency: 'ALTA',
      summary: 'Momento de crise familiar/pessoal com pedido urgente de oração e contato.',
      attention: true,
      suggestedReply: 'Olá, Juliana! Recebemos sua mensagem com todo carinho. Você não está sozinha e já estamos em oração por você. Nosso pastor entrará em contato com você o mais rápido possível. Conta com a gente!'
    },
    {
      name: 'Felipe Augusto Ribeiro',
      phone: '(41) 99123-4567',
      norm: '+5541991234567',
      replyText: 'Fala pessoal! Estou viajando a lazer em Florianópolis com a família, retorno na próxima semana!',
      category: 'VIAGEM',
      confidence: 0.92,
      sentiment: 'POSITIVO',
      urgency: 'BAIXA',
      summary: 'Viagem de férias em família fora da cidade.',
      attention: false,
      suggestedReply: 'Olá, Felipe! Que você e sua família tenham dias abençoados de descanso. Boa viagem e nos vemos no seu retorno!'
    },
    {
      name: 'Patrícia Gomes Martins',
      phone: '(11) 99555-6677',
      norm: '+5511995556677',
      replyText: '👍 blz valeu',
      category: 'INCONCLUSIVO',
      confidence: 0.45,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      summary: 'Resposta monossilábica sem justificativa de ausência.',
      attention: false,
      suggestedReply: 'Olá, Patrícia! Esperamos que esteja tudo bem por aí. Qualquer coisa que precisar estamos à disposição!'
    },
    {
      name: 'Diego Carvalho Silva',
      phone: '(31) 97777-8899',
      norm: '+5531977778899',
      replyText: 'Nossa me esqueci totalmente do culto hoje, perdi a hora!',
      category: 'ESQUECIMENTO',
      confidence: 0.95,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      summary: 'Esqueceu o horário da reunião.',
      attention: false,
      suggestedReply: 'Olá, Diego! Tudo bem, imprevistos acontecem! Esperamos você com muita alegria no próximo encontro!'
    }
  ];

  // Campanha criada para os ausentes
  const campaign = await prisma.campaign.create({
    data: {
      eventId: event.id,
      name: `Campanha Pós-Evento: ${event.name} (Ausentes)`,
      type: 'AUSENTE_FOLLOWUP',
      templateName: 'pos_evento_ausente',
      messageBody: 'Olá, {{nome}}! Graça e Paz! Sentimos sua falta no {{evento}}. Aconteceu alguma coisa? Está tudo bem por aí?',
      status: 'COMPLETED',
      totalRecipients: ausentesData.length,
      totalSent: ausentesData.length,
      totalDelivered: ausentesData.length,
      totalFailed: 0
    }
  });

  for (const item of ausentesData) {
    const person = await prisma.person.create({
      data: {
        name: item.name,
        phone: item.phone,
        normalizedPhone: item.norm,
        optOut: false
      }
    });

    await prisma.attendance.create({
      data: {
        personId: person.id,
        eventId: event.id,
        invited: true,
        attended: false,
        source: 'CSV_IMPORT'
      }
    });

    const conversation = await prisma.conversation.create({
      data: {
        personId: person.id,
        status: 'REPLIED',
        category: item.category,
        requiresHumanAttention: item.attention,
        lastMessageAt: new Date()
      }
    });

    // Mensagem Outbound da Campanha
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        personId: person.id,
        campaignId: campaign.id,
        direction: 'OUTBOUND',
        providerMessageId: `wamid.seed_out_${person.id.substring(0, 8)}`,
        content: `Olá, ${item.name.split(' ')[0]}! Graça e Paz! Sentimos sua falta no Culto de Celebração de Domingo. Aconteceu alguma coisa? Está tudo bem por aí?`,
        status: 'READ',
        sentAt: new Date(Date.now() - 3600000),
        deliveredAt: new Date(Date.now() - 3550000),
        readAt: new Date(Date.now() - 3500000)
      }
    });

    // Mensagem Inbound com Resposta
    const inboundMsg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        personId: person.id,
        direction: 'INBOUND',
        providerMessageId: `wamid.seed_in_${person.id.substring(0, 8)}`,
        content: item.replyText,
        status: 'READ',
        deliveredAt: new Date(Date.now() - 1800000),
        readAt: new Date(Date.now() - 1800000)
      }
    });

    // Análise de IA
    await prisma.aIAnalysis.create({
      data: {
        messageId: inboundMsg.id,
        conversationId: conversation.id,
        category: item.category,
        confidence: item.confidence,
        sentiment: item.sentiment,
        summary: item.summary,
        requiresHumanAttention: item.attention,
        suggestedReply: item.suggestedReply,
        modelUsed: 'GEMINI (gemini-2.0-flash)',
        rawResponse: JSON.stringify({
          category: item.category,
          confidence: item.confidence,
          sentiment: item.sentiment,
          summary: item.summary,
          requires_human_attention: item.attention,
          urgency: item.urgency,
          suggested_reply: item.suggestedReply
        })
      }
    });
  }

  // Log de auditoria
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'DATABASE_SEEDED',
      entityType: 'System',
      details: JSON.stringify({
        events: 1,
        persons: presentes.length + ausentesData.length,
        attendances: presentes.length + ausentesData.length,
        conversations: ausentesData.length
      })
    }
  });

  console.log('[Seed] População concluída com sucesso! Banco pronto para uso.');
}

main()
  .catch((e) => {
    console.error('[Seed] Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
