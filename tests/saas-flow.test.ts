import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { buildApp } from '../src/presentation/server.js';

describe('Validação do FLUXO SaaS REAL pelo Frontend/API', () => {
  let server: Server;
  let baseUrl: string;

  const timestamp = Date.now();
  const testUser = {
    name: `Usuario SaaS ${timestamp}`,
    email: `saas.user.${timestamp}@teste.com`,
    password: 'Password123!@#'
  };

  let sessionCookie: string;
  let workspaceId: string;
  let createdPersonId: string;
  let createdEventId: string;

  beforeAll(async () => {
    // 1. Inicializa servidor real
    const { app } = buildApp();
    await new Promise<void>(resolve => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}/api`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    try {
      if (server) {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      if (workspaceId) {
        await prisma.attendance.deleteMany({ where: { organizationId: workspaceId } });
        await prisma.event.deleteMany({ where: { organizationId: workspaceId } });
        await prisma.person.deleteMany({ where: { organizationId: workspaceId } });
        await prisma.member.deleteMany({ where: { organizationId: workspaceId } });
        await prisma.organizationSettings.deleteMany({ where: { organizationId: workspaceId } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: workspaceId } });
        await prisma.organization.deleteMany({ where: { id: workspaceId } });
      }
      const user = await prisma.user.findUnique({ where: { email: testUser.email } });
      if (user) {
        await prisma.session.deleteMany({ where: { userId: user.id } });
        await prisma.account.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
      await prisma.$disconnect();
    } catch {
      // Ignora erros de teardown
    }
  });

  // Helper para extrair e manter cookies
  const parseCookieHeader = (res: Response) => {
    const raw = res.headers.get('set-cookie') || '';
    return raw
      .split(',')
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  };

  // 1. Cadastro
  it('1. Cadastro: Deve cadastrar novo usuário via /api/auth/sign-up/email', async () => {
    const res = await fetch(`${baseUrl}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(testUser.email);

    const cookie = parseCookieHeader(res);
    expect(cookie).toContain('better-auth.session_token');
    sessionCookie = cookie;
  });

  // 2. Login
  it('2. Login: Deve realizar login com sucesso e receber cookie de sessão', async () => {
    const res = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(testUser.email);

    const cookie = parseCookieHeader(res);
    if (cookie) sessionCookie = cookie;
  });

  // 3. Criação e Seleção de Workspace
  it('3. Criação/seleção de workspace: Deve criar e listar organização', async () => {
    // Cria Workspace
    const createRes = await fetch(`${baseUrl}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        name: `Igreja Conecta E2E ${timestamp}`
      })
    });

    expect(createRes.status).toBe(201);
    const createdOrg = await createRes.json();
    expect(createdOrg.id).toBeDefined();
    expect(createdOrg.name).toBe(`Igreja Conecta E2E ${timestamp}`);
    workspaceId = createdOrg.id;

    // Lista Workspaces do usuário logado
    const listRes = await fetch(`${baseUrl}/organizations/my`, {
      headers: {
        Cookie: sessionCookie
      }
    });

    expect(listRes.status).toBe(200);
    const orgs = await listRes.json();
    expect(Array.isArray(orgs)).toBe(true);
    expect(orgs.some((o: any) => o.id === workspaceId)).toBe(true);
  });

  // 4. Dashboard
  it('4. Dashboard: Deve carregar métricas iniciais do workspace', async () => {
    const res = await fetch(`${baseUrl}/metrics/dashboard`, {
      headers: {
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      }
    });

    expect(res.status).toBe(200);
    const metrics = await res.json();
    expect(metrics.totalPersons).toBe(0);
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.totalPresent).toBe(0);
  });

  // 5. Criar Contato
  it('5. Criar contato: Deve cadastrar contato no CRM com telefone E.164 normalizado', async () => {
    const res = await fetch(`${baseUrl}/persons`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      },
      body: JSON.stringify({
        name: 'Lucas Ferreira',
        phone: '(11) 98111-2233',
        email: 'lucas.ferreira@teste.com',
        notes: 'Membro da equipe de louvor'
      })
    });

    expect(res.status).toBe(201);
    const person = await res.json();
    expect(person.id).toBeDefined();
    expect(person.name).toBe('Lucas Ferreira');
    expect(person.normalizedPhone).toBe('+5511981112233');
    expect(person.organizationId).toBe(workspaceId);
    createdPersonId = person.id;
  });

  // 6. Criar Evento
  it('6. Criar evento: Deve criar evento na organização', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      },
      body: JSON.stringify({
        name: 'Culto de Celebração de Domingo',
        eventDate: '2026-10-15T19:00:00.000Z',
        location: 'Auditório Principal',
        description: 'Culto da Família com Ceia'
      })
    });

    expect(res.status).toBe(201);
    const event = await res.json();
    expect(event.id).toBeDefined();
    expect(event.name).toBe('Culto de Celebração de Domingo');
    expect(event.organizationId).toBe(workspaceId);
    createdEventId = event.id;
  });

  // 7. Registrar Presença
  it('7. Registrar presença: Deve registrar presença do contato no evento', async () => {
    const res = await fetch(`${baseUrl}/events/${createdEventId}/attendances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      },
      body: JSON.stringify({
        personId: createdPersonId,
        attended: true,
        notes: 'Check-in realizado com sucesso'
      })
    });

    expect(res.status).toBe(201);
    const attendance = await res.json();
    expect(attendance.attended).toBe(true);
    expect(attendance.personId).toBe(createdPersonId);
    expect(attendance.eventId).toBe(createdEventId);

    // Valida no evento que os contadores foram recalculados
    const eventRes = await fetch(`${baseUrl}/events/${createdEventId}`, {
      headers: {
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      }
    });
    expect(eventRes.status).toBe(200);
    const event = await eventRes.json();
    expect(event.presentCount).toBe(1);
    expect(event.attendees.some((p: any) => p.id === createdPersonId)).toBe(true);
  });

  // 8. Logout
  it('8. Logout: Deve encerrar a sessão e invalidar acesso', async () => {
    const res = await fetch(`${baseUrl}/auth/sign-out`, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie
      }
    });

    expect(res.status).toBe(200);

    // Request posterior sem autenticação deve retornar 401
    const unauthRes = await fetch(`${baseUrl}/metrics/dashboard`, {
      headers: {
        'x-organization-id': workspaceId
      }
    });
    expect(unauthRes.status).toBe(401);
  });

  // 9. Login
  it('9. Login: Deve autenticar novamente com as mesmas credenciais', async () => {
    const res = await fetch(`${baseUrl}/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(testUser.email);

    const cookie = parseCookieHeader(res);
    expect(cookie).toContain('better-auth.session_token');
    sessionCookie = cookie;
  });

  // 10. Confirmar Persistência
  it('10. Confirmar persistência: Todos os dados (contato, evento, presença, métricas) devem estar persistidos no PostgreSQL', async () => {
    // 10.1 Organizações persistem
    const orgsRes = await fetch(`${baseUrl}/organizations/my`, {
      headers: { Cookie: sessionCookie }
    });
    expect(orgsRes.status).toBe(200);
    const orgs = await orgsRes.json();
    expect(orgs.some((o: any) => o.id === workspaceId)).toBe(true);

    // 10.2 Contato persiste
    const personsRes = await fetch(`${baseUrl}/persons`, {
      headers: {
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      }
    });
    expect(personsRes.status).toBe(200);
    const persons = await personsRes.json();
    const foundPerson = persons.find((p: any) => p.id === createdPersonId);
    expect(foundPerson).toBeDefined();
    expect(foundPerson.name).toBe('Lucas Ferreira');
    expect(foundPerson.normalizedPhone).toBe('+5511981112233');

    // 10.3 Evento persiste
    const eventsRes = await fetch(`${baseUrl}/events`, {
      headers: {
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      }
    });
    expect(eventsRes.status).toBe(200);
    const events = await eventsRes.json();
    const foundEvent = events.find((e: any) => e.id === createdEventId);
    expect(foundEvent).toBeDefined();
    expect(foundEvent.name).toBe('Culto de Celebração de Domingo');

    // 10.4 Presença persiste e detalhe do evento contém o participante
    const eventDetailRes = await fetch(`${baseUrl}/events/${createdEventId}`, {
      headers: {
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      }
    });
    expect(eventDetailRes.status).toBe(200);
    const eventDetail = await eventDetailRes.json();
    expect(eventDetail.presentCount).toBe(1);
    expect(eventDetail.attendees.some((p: any) => p.id === createdPersonId)).toBe(true);

    // 10.5 Métricas do Dashboard refletem os dados persistidos
    const metricsRes = await fetch(`${baseUrl}/metrics/dashboard`, {
      headers: {
        Cookie: sessionCookie,
        'x-organization-id': workspaceId
      }
    });
    expect(metricsRes.status).toBe(200);
    const metrics = await metricsRes.json();
    expect(metrics.totalPersons).toBe(1);
    expect(metrics.totalEvents).toBe(1);
    expect(metrics.totalPresent).toBe(1);
  });
});
