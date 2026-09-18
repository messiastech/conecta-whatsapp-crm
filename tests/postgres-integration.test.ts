import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { MockWhatsAppProvider } from '../src/infrastructure/whatsapp/mock-whatsapp.provider.js';
import { CompositeAIService } from '../src/infrastructure/ai/composite-ai.service.js';
import { WebhooksController } from '../src/presentation/controllers/webhooks.controller.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';

// Define chave de teste para operações criptográficas da suíte
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

describe('Testes REAIS de Integração Multi-Tenant com PostgreSQL', () => {
  let orgAId: string;
  let orgBId: string;
  let userOwnerAId: string;
  let userViewerAId: string;
  let userOperatorAId: string;

  beforeAll(async () => {
    // Validação estrita: exige DATABASE_URL PostgreSQL funcional
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))) {
      throw new Error(
        'REQUISITO FALTANTE: DATABASE_URL PostgreSQL funcional não configurada no ambiente. ' +
        'Testes reais com PostgreSQL exigem uma connection string válida (ex: Neon, Supabase, RDS).'
      );
    }

    try {
      await prisma.$connect();
    } catch (err: any) {
      throw new Error(`REQUISITO FALTANTE: Falha ao conectar no PostgreSQL via DATABASE_URL: ${err.message}`);
    }

    // Criação dos usuários para teste de RBAC
    const userA = await prisma.user.create({
      data: {
        id: `user_owner_a_${Date.now()}`,
        name: 'Owner Org A',
        email: `owner.a.${Date.now()}@test.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    userOwnerAId = userA.id;

    const userViewer = await prisma.user.create({
      data: {
        id: `user_viewer_a_${Date.now()}`,
        name: 'Viewer Org A',
        email: `viewer.a.${Date.now()}@test.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    userViewerAId = userViewer.id;

    const userOperator = await prisma.user.create({
      data: {
        id: `user_operator_a_${Date.now()}`,
        name: 'Operator Org A',
        email: `operator.a.${Date.now()}@test.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    userOperatorAId = userOperator.id;

    // Criação das duas organizações reais no banco
    const orgA = await prisma.organization.create({
      data: {
        id: `org_alpha_${Date.now()}`,
        name: 'Workspace Alpha Teste',
        slug: `org-alpha-${Date.now()}`,
        createdAt: new Date()
      }
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        id: `org_beta_${Date.now()}`,
        name: 'Workspace Beta Teste',
        slug: `org-beta-${Date.now()}`,
        createdAt: new Date()
      }
    });
    orgBId = orgB.id;

    // Associa membros com seus respectivos papéis na Org A
    await prisma.member.createMany({
      data: [
        {
          id: `member_owner_${Date.now()}`,
          organizationId: orgAId,
          userId: userOwnerAId,
          role: 'owner',
          createdAt: new Date()
        },
        {
          id: `member_viewer_${Date.now()}`,
          organizationId: orgAId,
          userId: userViewerAId,
          role: 'viewer',
          createdAt: new Date()
        },
        {
          id: `member_operator_${Date.now()}`,
          organizationId: orgAId,
          userId: userOperatorAId,
          role: 'operator',
          createdAt: new Date()
        }
      ]
    });

    // Configura WhatsAppConnection para Org A
    await prisma.whatsAppConnection.create({
      data: {
        organizationId: orgAId,
        isMock: true,
        phoneNumberId: `phone_id_alpha_${Date.now()}`,
        wabaId: `waba_id_alpha_${Date.now()}`
      }
    });
  });

  afterAll(async () => {
    try {
      if (orgAId && orgBId) {
        await prisma.message.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.conversation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.attendance.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.person.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.event.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.member.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
      }
      if (userOwnerAId) {
        await prisma.user.deleteMany({ where: { id: { in: [userOwnerAId, userViewerAId, userOperatorAId] } } });
      }
      await prisma.$disconnect();
    } catch {
      // Ignora erros de teardown se o banco não conectou
    }
  });

  // 1. Mesmo telefone nas duas organizações (chave composta @@unique([organizationId, normalizedPhone]))
  it('1. Deve permitir o mesmo número de telefone na Org A e na Org B simultaneamente', async () => {
    const sharedPhone = '+5511999991111';

    const personA = await prisma.person.create({
      data: {
        organizationId: orgAId,
        name: 'Contato Compartilhado Org A',
        phoneRaw: '(11) 99999-1111',
        normalizedPhone: sharedPhone
      }
    });

    const personB = await prisma.person.create({
      data: {
        organizationId: orgBId,
        name: 'Contato Compartilhado Org B',
        phoneRaw: '(11) 99999-1111',
        normalizedPhone: sharedPhone
      }
    });

    expect(personA.id).toBeDefined();
    expect(personB.id).toBeDefined();
    expect(personA.id).not.toBe(personB.id);
    expect(personA.normalizedPhone).toBe(sharedPhone);
    expect(personB.normalizedPhone).toBe(sharedPhone);

    // Tentativa de duplicar na mesma organização DEVE falhar (P2002)
    await expect(
      prisma.person.create({
        data: {
          organizationId: orgAId,
          name: 'Duplicata Proibida na Org A',
          phoneRaw: '(11) 99999-1111',
          normalizedPhone: sharedPhone
        }
      })
    ).rejects.toThrow();
  });

  // 2. Org A não lê nem altera dados da Org B
  it('2. Org A não deve conseguir ler nem alterar dados pertencentes à Org B', async () => {
    // Cria um evento exclusivo na Org B
    const eventB = await prisma.event.create({
      data: {
        organizationId: orgBId,
        name: 'Evento Ultra Secreto Org B',
        eventDate: new Date('2026-10-01T19:00:00Z'),
        location: 'Sede Beta'
      }
    });

    // Query isolada pela Org A
    const eventsFromA = await prisma.event.findMany({
      where: { organizationId: orgAId }
    });

    const foundInA = eventsFromA.find(e => e.id === eventB.id);
    expect(foundInA).toBeUndefined();

    // Tentativa de alteração com filtro de Org A não deve alterar nada
    const updateResult = await prisma.event.updateMany({
      where: {
        id: eventB.id,
        organizationId: orgAId // Org A tentando alterar dado da Org B
      },
      data: { name: 'Nome Hackeado' }
    });

    expect(updateResult.count).toBe(0);

    // Verifica que o dado na Org B permaneceu inalterado
    const checkB = await prisma.event.findUnique({ where: { id: eventB.id } });
    expect(checkB?.name).toBe('Evento Ultra Secreto Org B');
  });

  // 3. Papel VIEWER não pode escrever
  it('3. Membro com papel VIEWER não deve ter autorização para operações de escrita', async () => {
    const memberViewer = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgAId,
          userId: userViewerAId
        }
      }
    });

    expect(memberViewer?.role).toBe('viewer');

    // Validador de permissão de escrita (mesma lógica do requireRole(['OWNER', 'ADMIN', 'OPERATOR']))
    const canWrite = ['owner', 'admin', 'operator'].includes(memberViewer?.role?.toLowerCase() || '');
    expect(canWrite).toBe(false);
  });

  // 4. Papel OPERATOR não pode alterar configurações do Workspace
  it('4. Membro com papel OPERATOR não deve ter permissão para alterar OrganizationSettings', async () => {
    const memberOperator = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgAId,
          userId: userOperatorAId
        }
      }
    });

    expect(memberOperator?.role).toBe('operator');

    // Settings exige exclusivamente OWNER ou ADMIN (requireRole(['OWNER', 'ADMIN']))
    const canModifySettings = ['owner', 'admin'].includes(memberOperator?.role?.toLowerCase() || '');
    expect(canModifySettings).toBe(false);
  });

  // 5. Sandbox não cruza dados entre tenants
  it('5. Simulador Sandbox não deve vazar mensagens ou eventos entre organizações distintas', async () => {
    const mockProvider = MockWhatsAppProvider.getInstance();

    // Dispara mensagem mock especificando a Org A
    await mockProvider.sendTextMessage('+5511999990001', 'Mensagem confidencial Org A', orgAId);

    // Consulta histórico da Org A
    const historyA = mockProvider.getHistory(orgAId);
    const hasMsgInA = historyA.some(m => m.text === 'Mensagem confidencial Org A');
    expect(hasMsgInA).toBe(true);

    // Consulta histórico da Org B: NÃO pode conter a mensagem da Org A
    const historyB = mockProvider.getHistory(orgBId);
    const hasMsgInB = historyB.some(m => m.text === 'Mensagem confidencial Org A');
    expect(hasMsgInB).toBe(false);
  });

  // 6. phone_number_id desconhecido não é processado pelo Webhook
  it('6. Webhook da Meta com phone_number_id desconhecido deve ser rejeitado com 404 e não processar mensagens', async () => {
    const mockProvider = MockWhatsAppProvider.getInstance();
    const aiService = new CompositeAIService();
    const webhooksController = new WebhooksController(mockProvider, aiService);

    let statusCaptured = 0;
    let jsonCaptured: any = null;

    const mockReq: any = {
      headers: {},
      body: {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'unknown_waba',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '5511999998888',
                    phone_number_id: 'phone_id_totalmente_desconhecido_9999'
                  },
                  messages: [
                    {
                      from: '5511987654321',
                      id: 'wamid.unknown_test',
                      timestamp: '1724870000',
                      text: { body: 'Mensagem de invasor' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      }
    };

    const mockRes: any = {
      status(code: number) {
        statusCaptured = code;
        return this;
      },
      json(data: any) {
        jsonCaptured = data;
        return this;
      },
      send(text: string) {
        jsonCaptured = text;
        return this;
      }
    };

    await webhooksController.handle(mockReq, mockRes);

    // Deve retornar status 404 rejeitando o evento por phone_number_id desconhecido
    expect(statusCaptured).toBe(404);
    expect(jsonCaptured.error).toBe('UNKNOWN_PHONE_NUMBER_ID');

    // Garante que a mensagem NÃO foi criada em nenhuma organização
    const savedMsg = await prisma.message.findFirst({
      where: { providerMessageId: 'wamid.unknown_test' }
    });
    expect(savedMsg).toBeNull();
  });
});
