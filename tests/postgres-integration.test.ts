import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { buildApp } from '../src/presentation/server.js';

// Define chave de teste para operações criptográficas
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

describe('Testes REAIS de Integração Multi-Tenant & Segurança E2E com PostgreSQL', () => {
  let server: Server;
  let baseUrl: string;

  // Organizações
  let orgAId: string;
  let orgBId: string;

  // Usuários
  let userOwnerAId: string;
  let userOperatorAId: string;
  let userViewerAId: string;
  let userOwnerBId: string;

  // Tokens de Sessão Better Auth
  let tokenOwnerA: string;
  let tokenOperatorA: string;
  let tokenViewerA: string;
  let tokenOwnerB: string;

  // Recursos para validação cross-tenant
  let eventBId: string;
  let personBId: string;

  beforeAll(async () => {
    // 1. Validação estrita: exige DATABASE_URL PostgreSQL funcional
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))) {
      throw new Error(
        'REQUISITO FALTANTE: DATABASE_URL PostgreSQL funcional não configurada no ambiente. ' +
        'Testes reais de integração E2E com PostgreSQL exigem uma connection string válida (ex: Neon, Supabase, RDS).'
      );
    }

    try {
      await prisma.$connect();
    } catch (err: any) {
      throw new Error(`REQUISITO FALTANTE: Falha ao conectar no PostgreSQL via DATABASE_URL: ${err.message}`);
    }

    // 2. Inicializa o servidor Express real em porta efêmera (0)
    const { app } = buildApp();
    server = app.listen(0);
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}/api`;

    const timestamp = Date.now();

    // 3. Criação de Organizações Reais
    const orgA = await prisma.organization.create({
      data: {
        id: `org_alpha_${timestamp}`,
        name: 'Workspace Alpha Teste',
        slug: `org-alpha-${timestamp}`,
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
            phoneNumberId: `phone_alpha_${timestamp}`,
            webhookVerifyToken: `token_alpha_${timestamp}`
          }
        }
      }
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        id: `org_beta_${timestamp}`,
        name: 'Workspace Beta Teste',
        slug: `org-beta-${timestamp}`,
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
            phoneNumberId: `phone_beta_${timestamp}`,
            webhookVerifyToken: `token_beta_${timestamp}`
          }
        }
      }
    });
    orgBId = orgB.id;

    // 4. Criação de Usuários Reais
    const userOwnerA = await prisma.user.create({
      data: {
        id: `user_owner_a_${timestamp}`,
        name: 'Owner Org A',
        email: `owner.a.${timestamp}@test.com`,
        emailVerified: true
      }
    });
    userOwnerAId = userOwnerA.id;

    const userOperatorA = await prisma.user.create({
      data: {
        id: `user_operator_a_${timestamp}`,
        name: 'Operator Org A',
        email: `operator.a.${timestamp}@test.com`,
        emailVerified: true
      }
    });
    userOperatorAId = userOperatorA.id;

    const userViewerA = await prisma.user.create({
      data: {
        id: `user_viewer_a_${timestamp}`,
        name: 'Viewer Org A',
        email: `viewer.a.${timestamp}@test.com`,
        emailVerified: true
      }
    });
    userViewerAId = userViewerA.id;

    const userOwnerB = await prisma.user.create({
      data: {
        id: `user_owner_b_${timestamp}`,
        name: 'Owner Org B',
        email: `owner.b.${timestamp}@test.com`,
        emailVerified: true
      }
    });
    userOwnerBId = userOwnerB.id;

    // 5. Associação de Membros e Papéis
    await prisma.member.createMany({
      data: [
        { id: `mem_owner_a_${timestamp}`, organizationId: orgAId, userId: userOwnerAId, role: 'OWNER' },
        { id: `mem_operator_a_${timestamp}`, organizationId: orgAId, userId: userOperatorAId, role: 'OPERATOR' },
        { id: `mem_viewer_a_${timestamp}`, organizationId: orgAId, userId: userViewerAId, role: 'VIEWER' },
        { id: `mem_owner_b_${timestamp}`, organizationId: orgBId, userId: userOwnerBId, role: 'OWNER' }
      ]
    });

    // 6. Criação de Sessões Reais no PostgreSQL para Better Auth
    tokenOwnerA = `session_token_owner_a_${timestamp}`;
    tokenOperatorA = `session_token_operator_a_${timestamp}`;
    tokenViewerA = `session_token_viewer_a_${timestamp}`;
    tokenOwnerB = `session_token_owner_b_${timestamp}`;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.session.createMany({
      data: [
        { id: `sess_owner_a_${timestamp}`, userId: userOwnerAId, token: tokenOwnerA, expiresAt },
        { id: `sess_operator_a_${timestamp}`, userId: userOperatorAId, token: tokenOperatorA, expiresAt },
        { id: `sess_viewer_a_${timestamp}`, userId: userViewerAId, token: tokenViewerA, expiresAt },
        { id: `sess_owner_b_${timestamp}`, userId: userOwnerBId, token: tokenOwnerB, expiresAt }
      ]
    });

    // 7. Cria Recursos Privados na Org B para testar isolamento cross-tenant
    const evB = await prisma.event.create({
      data: {
        organizationId: orgBId,
        name: 'Evento Ultra Secreto Org B',
        eventDate: new Date('2026-10-10T19:00:00Z'),
        location: 'Auditório Beta'
      }
    });
    eventBId = evB.id;

    const perB = await prisma.person.create({
      data: {
        organizationId: orgBId,
        name: 'Contato Exclusivo Org B',
        phone: '(11) 98888-2222',
        normalizedPhone: '+5511988882222'
      }
    });
    personBId = perB.id;
  });

  afterAll(async () => {
    try {
      if (server) {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      if (orgAId && orgBId) {
        await prisma.message.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.conversation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.attendance.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.person.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.event.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.organizationSettings.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.member.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
        await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
      }
      if (userOwnerAId) {
        await prisma.session.deleteMany({
          where: { userId: { in: [userOwnerAId, userOperatorAId, userViewerAId, userOwnerBId] } }
        });
        await prisma.user.deleteMany({
          where: { id: { in: [userOwnerAId, userOperatorAId, userViewerAId, userOwnerBId] } }
        });
      }
      await prisma.$disconnect();
    } catch {
      // Ignora erros de teardown se o banco não conectou
    }
  });

  // Helper HTTP para chamadas autenticadas na API
  const apiRequest = (
    path: string,
    options: { method?: string; body?: any; token?: string; orgId?: string } = {}
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (options.token) {
      headers['Cookie'] = `better-auth.session_token=${options.token}`;
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    if (options.orgId) {
      headers['x-organization-id'] = options.orgId;
    }
    return fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  };

  // 1. Mesmo telefone nas duas organizações (campo real Person.phone e @@unique([organizationId, normalizedPhone]))
  it('1. Deve permitir o mesmo número de telefone na Org A e na Org B (campo real Person.phone)', async () => {
    const sharedPhone = '+5511999991111';

    const personA = await prisma.person.create({
      data: {
        organizationId: orgAId,
        name: 'Contato Compartilhado Org A',
        phone: '(11) 99999-1111',
        normalizedPhone: sharedPhone
      }
    });

    const personB = await prisma.person.create({
      data: {
        organizationId: orgBId,
        name: 'Contato Compartilhado Org B',
        phone: '(11) 99999-1111',
        normalizedPhone: sharedPhone
      }
    });

    expect(personA.id).toBeDefined();
    expect(personB.id).toBeDefined();
    expect(personA.id).not.toBe(personB.id);
    expect(personA.phone).toBe('(11) 99999-1111');
    expect(personB.phone).toBe('(11) 99999-1111');
    expect(personA.normalizedPhone).toBe(sharedPhone);
    expect(personB.normalizedPhone).toBe(sharedPhone);

    // Tentativa de duplicar na mesma organização DEVE falhar por unicidade de tenant
    await expect(
      prisma.person.create({
        data: {
          organizationId: orgAId,
          name: 'Duplicata Proibida Org A',
          phone: '(11) 99999-1111',
          normalizedPhone: sharedPhone
        }
      })
    ).rejects.toThrow();
  });

  // 2. Validação de requireAuth real via HTTP
  it('2. Request HTTP sem sessão autenticada deve retornar 401 Unauthorized', async () => {
    const res = await apiRequest('/events', { orgId: orgAId });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('UNAUTHORIZED');
  });

  // 3. Validação de requireOrganization real via HTTP
  it('3. Request HTTP autenticado mas sem workspace deve retornar 400 Organization Required', async () => {
    const res = await apiRequest('/events', { token: tokenOwnerA });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ORGANIZATION_REQUIRED');
  });

  it('3.1 Usuário da Org A tentando acessar Org B deve receber 403 Forbidden', async () => {
    // User A envia token da Org A com header x-organization-id da Org B
    const res = await apiRequest('/events', { token: tokenOwnerA, orgId: orgBId });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN_WORKSPACE_ACCESS');
  });

  // 4. Isolamento Cross-Tenant (Org A tentando ler ou alterar recurso da Org B)
  it('4. Org A tentando GET em Evento da Org B via API deve receber 404 Not Found', async () => {
    const res = await apiRequest(`/events/${eventBId}`, {
      token: tokenOwnerA,
      orgId: orgAId
    });
    expect(res.status).toBe(404);
  });

  it('4.1 Org A tentando PUT em Contato da Org B via API deve receber 404 Not Found', async () => {
    const res = await apiRequest(`/persons/${personBId}`, {
      method: 'PUT',
      token: tokenOwnerA,
      orgId: orgAId,
      body: { name: 'Tentativa de Hack' }
    });
    expect(res.status).toBe(404);

    // Garante no banco que o contato de B não foi alterado
    const perB = await prisma.person.findUnique({ where: { id: personBId } });
    expect(perB?.name).toBe('Contato Exclusivo Org B');
  });

  // 5. Papel VIEWER tentando POST/PUT/PATCH deve receber 403 Forbidden
  it('5. Membro com papel VIEWER tentando criar Evento (POST) deve receber 403 Forbidden', async () => {
    const res = await apiRequest('/events', {
      method: 'POST',
      token: tokenViewerA,
      orgId: orgAId,
      body: {
        name: 'Evento Proibido para Viewer',
        eventDate: '2026-11-01T19:00:00Z',
        location: 'Sala 1'
      }
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN_ROLE');
  });

  // 6. Papel OPERATOR tentando alterar /organization/settings deve receber 403 Forbidden
  it('6. Membro com papel OPERATOR tentando alterar configurações (PATCH) deve receber 403 Forbidden', async () => {
    const res = await apiRequest('/organization/settings', {
      method: 'PATCH',
      token: tokenOperatorA,
      orgId: orgAId,
      body: { timezone: 'America/Manaus' }
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN_ROLE');
  });

  it('6.1 Membro com papel OWNER deve conseguir alterar /organization/settings com sucesso (200 OK)', async () => {
    const res = await apiRequest('/organization/settings', {
      method: 'PATCH',
      token: tokenOwnerA,
      orgId: orgAId,
      body: { timezone: 'America/Manaus' }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timezone).toBe('America/Manaus');
  });

  // 7. Sandbox isolado por tenant via API HTTP
  it('7. Simulador Sandbox via API HTTP não deve cruzar histórico entre organizações', async () => {
    // Org A simula resposta no Sandbox
    const replyRes = await apiRequest('/sandbox/simulate-reply', {
      method: 'POST',
      token: tokenOwnerA,
      orgId: orgAId,
      body: {
        fromPhone: '+5511999990001',
        text: 'Resposta Sandbox Org A'
      }
    });
    expect(replyRes.status).toBe(200);

    // Consulta histórico pela Org A: deve conter a mensagem
    const histARes = await apiRequest('/sandbox/history', {
      token: tokenOwnerA,
      orgId: orgAId
    });
    expect(histARes.status).toBe(200);
    const historyA = await histARes.json();
    expect(historyA.some((m: any) => m.text === 'Resposta Sandbox Org A')).toBe(true);

    // Consulta histórico pela Org B: NÃO deve conter a mensagem da Org A
    const histBRes = await apiRequest('/sandbox/history', {
      token: tokenOwnerB,
      orgId: orgBId
    });
    expect(histBRes.status).toBe(200);
    const historyB = await histBRes.json();
    expect(historyB.some((m: any) => m.text === 'Resposta Sandbox Org A')).toBe(false);
  });

  // 8. Webhook da Meta com phone_number_id desconhecido retorna 404
  it('8. Webhook Meta com phone_number_id desconhecido deve retornar 404 e não criar mensagens', async () => {
    const res = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
                    phone_number_id: 'phone_id_inexistente_9999'
                  },
                  messages: [
                    {
                      from: '5511987654321',
                      id: 'wamid.unknown_http_test',
                      timestamp: '1724870000',
                      text: { body: 'Tentativa de injeção' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      })
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('UNKNOWN_PHONE_NUMBER_ID');

    const savedMsg = await prisma.message.findFirst({
      where: { providerMessageId: 'wamid.unknown_http_test' }
    });
    expect(savedMsg).toBeNull();
  });
});

