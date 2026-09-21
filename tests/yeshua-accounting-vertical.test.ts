import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { buildApp } from '../src/presentation/server.js';
import { AccountingAIPolicy } from '../src/application/verticals/accounting/accounting-ai-policy.js';
import { ACCOUNTING_SCENARIOS } from '../src/application/verticals/accounting/accounting-scenarios.js';
import { ProcessInboundMessageUseCase } from '../src/application/use-cases/process-inbound-message.use-case.js';
import { CompositeAIService } from '../src/infrastructure/ai/composite-ai.service.js';
import { seedYeshuaDemo } from '../src/infrastructure/database/seed-yeshua-demo.js';

describe('Suíte de Testes da Vertical Contábil (Yeshua Contabilidade — Demo)', () => {
  let server: http.Server;
  let baseUrl: string;
  let yeshuaOrgId: string;
  let defaultOrgId: string;
  let userCookie: string;
  let inboundUseCase: ProcessInboundMessageUseCase;

  const parseCookieHeader = (res: any) => {
    if (typeof res.headers.getSetCookie === 'function') {
      const cookies = res.headers.getSetCookie();
      return cookies.map((c: string) => c.split(';')[0].trim()).join('; ');
    }
    const raw = res.headers.get('set-cookie') || '';
    return raw
      .split(',')
      .map((c: string) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  };

  beforeAll(async () => {
    const { app } = buildApp();
    inboundUseCase = new ProcessInboundMessageUseCase(new CompositeAIService());

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Cadastra usuário de teste
    const userEmail = `yeshua-test-${Date.now()}@test.com`;
    const signupRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Yeshua Auditor',
        email: userEmail,
        password: 'Password123!'
      })
    });
    userCookie = parseCookieHeader(signupRes);

    // Cria Org Yeshua (ACCOUNTING)
    const yeshuaOrg = await prisma.organization.create({
      data: {
        name: 'Yeshua Contabilidade Test',
        slug: `yeshua-test-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'ACCOUNTING',
          brandName: 'YESHUA AI CLIENT DESK',
          brandSubtitle: 'powered by MEGA CORE'
        }),
        members: {
          create: {
            userId: (await prisma.user.findUnique({ where: { email: userEmail } }))!.id,
            role: 'OWNER'
          }
        },
        settings: {
          create: { timezone: 'America/Sao_Paulo', language: 'pt-BR', aiProvider: 'LOCAL_FALLBACK' }
        },
        whatsAppConnection: {
          create: { isMock: true, status: 'CONNECTED' }
        }
      }
    });
    yeshuaOrgId = yeshuaOrg.id;

    // Cria Org Padrão (DEFAULT)
    const defaultOrg = await prisma.organization.create({
      data: {
        name: 'Comunidade Pastoral Test',
        slug: `pastoral-test-${Date.now()}`,
        members: {
          create: {
            userId: (await prisma.user.findUnique({ where: { email: userEmail } }))!.id,
            role: 'OWNER'
          }
        },
        settings: {
          create: { timezone: 'America/Sao_Paulo', language: 'pt-BR', aiProvider: 'LOCAL_FALLBACK' }
        },
        whatsAppConnection: {
          create: { isMock: true, status: 'CONNECTED' }
        }
      }
    });
    defaultOrgId = defaultOrg.id;
  }, 90000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));

    try {
      const orgIds = [yeshuaOrgId, defaultOrgId].filter(Boolean);
      for (const orgId of orgIds) {
        await prisma.followUpTask.deleteMany({ where: { organizationId: orgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: orgId } });
        await prisma.message.deleteMany({ where: { organizationId: orgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
        await prisma.person.deleteMany({ where: { organizationId: orgId } });
        await prisma.attendance.deleteMany({ where: { organizationId: orgId } });
        await prisma.campaign.deleteMany({ where: { organizationId: orgId } });
        await prisma.event.deleteMany({ where: { organizationId: orgId } });
        await prisma.organizationSettings.deleteMany({ where: { organizationId: orgId } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: orgId } });
        await prisma.member.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      }
    } catch {
      // Ignora erros de teardown
    }
  });

  // --- 1. Isolamento de Perfil e Branding via API ---
  it('1. GET /api/organizations/my, GET /api/organization/settings e GET /api/public-config devem retornar verticalProfile e branding corretos', async () => {
    // Valida endpoint público de configuração
    const resPublic = await fetch(`${baseUrl}/api/public-config`);
    expect(resPublic.status).toBe(200);
    const pubConfig = await resPublic.json() as any;
    expect(pubConfig.verticalProfile).toBeDefined();

    const resOrgs = await fetch(`${baseUrl}/api/organizations/my`, {
      headers: { cookie: userCookie }
    });
    expect(resOrgs.status).toBe(200);
    const orgs = await resOrgs.json() as any[];

    const yeshuaInList = orgs.find(o => o.id === yeshuaOrgId);
    expect(yeshuaInList).toBeDefined();
    expect(yeshuaInList.verticalProfile).toBe('ACCOUNTING');
    expect(yeshuaInList.brandName).toBe('YESHUA AI CLIENT DESK');
    expect(yeshuaInList.brandSubtitle).toBe('powered by MEGA CORE');

    const defaultInList = orgs.find(o => o.id === defaultOrgId);
    expect(defaultInList).toBeDefined();
    expect(defaultInList.verticalProfile).toBe('DEFAULT');

    // GET /api/organization/settings na org Yeshua
    const resSettings = await fetch(`${baseUrl}/api/organization/settings`, {
      headers: { cookie: userCookie, 'x-organization-id': yeshuaOrgId }
    });
    expect(resSettings.status).toBe(200);
    const settingsData = await resSettings.json() as any;
    expect(settingsData.organization.verticalProfile).toBe('ACCOUNTING');
    expect(settingsData.organization.brandName).toBe('YESHUA AI CLIENT DESK');
  });

  // --- 2. Validação dos 6 Cenários Contábeis pela AccountingAIPolicy ---
  it('2. AccountingAIPolicy deve classificar com precisão os 6 cenários contábeis com respostas seguras e disclaimer', () => {
    for (const scenario of ACCOUNTING_SCENARIOS) {
      const result = AccountingAIPolicy.analyze(scenario.text, {
        clientName: scenario.clientName,
        companyName: scenario.companyName
      });

      expect(result.category).toBe(scenario.expectedCategory);
      expect(result.priority).toBe(scenario.expectedPriority);
      expect(result.suggestedReply).toBeTruthy();
      expect(result.suggestedReply.length).toBeGreaterThan(20);
      // Valida que o disclaimer obrigatório está presente
      expect(result.suggestedReply).toContain('Resposta sugerida — sujeita à validação da equipe Yeshua');
      // Valida ausência de promessas falsas de SLA irrealistas
      expect(result.suggestedReply).not.toContain('em até 1 hora');
      expect(result.suggestedReply).not.toContain('já assumiu');
    }
  });

  // --- 3. Processamento End-to-End no Tenant ACCOUNTING ---
  it('3. ProcessInboundMessageUseCase em tenant ACCOUNTING deve gerar análise contábil e pendência fiscal', async () => {
    const testPhone = '+5511985556677';
    const textMsg = 'Recebemos uma intimação da SEFAZ com prazo de 5 dias úteis alegando divergência de recolhimento de ICMS-ST dos últimos 2 anos. Precisamos de defesa urgente!';

    const result = await inboundUseCase.execute({
      organizationId: yeshuaOrgId,
      fromPhone: testPhone,
      text: textMsg
    });

    expect(result.classification).toBeDefined();
    expect(result.classification!.category).toBe('CASO_COMPLEXO');
    expect(result.classification!.priority).toBe('URGENT');
    expect(result.followUpTaskId).toBeDefined();

    // Valida persistência no banco
    const task = await prisma.followUpTask.findUnique({
      where: { id: result.followUpTaskId! }
    });
    expect(task).toBeTruthy();
    expect(task!.title).toContain('Pendência Contábil');
    expect(task!.description).toContain('Ação Contábil Recomendada');
    expect(task!.priority).toBe('URGENT');

    const analysis = await prisma.aIAnalysis.findFirst({
      where: { messageId: result.messageId }
    });
    expect(analysis).toBeTruthy();
    expect(analysis!.modelUsed).toBe('YESHUA_ACCOUNTING_AI');
    expect(analysis!.category).toBe('CASO_COMPLEXO');
  });

  // --- 4. Não-Regressão do Perfil DEFAULT (Fluxo Pastoral Intacto) ---
  it('4. ProcessInboundMessageUseCase em tenant DEFAULT deve manter categorização pastoral/ausência', async () => {
    const pastoralPhone = '+5511987654321';
    const pastoralMsg = 'Oi pastor! Tive febre alta e fui na UPA com minha filha.';

    const result = await inboundUseCase.execute({
      organizationId: defaultOrgId,
      fromPhone: pastoralPhone,
      text: pastoralMsg
    });

    expect(result.classification).toBeDefined();
    expect(result.classification!.category).toBe('SAUDE');
    expect(result.classification!.priority).toBe('HIGH');
    expect(result.followUpTaskId).toBeDefined();

    // Valida que o título da tarefa no perfil DEFAULT é pastoral
    const task = await prisma.followUpTask.findUnique({
      where: { id: result.followUpTaskId! }
    });
    expect(task).toBeTruthy();
    expect(task!.title).toContain('Acompanhamento Pastoral');
  });

  // --- 5. Idempotência do Seed Yeshua Demo ---
  it('5. seedYeshuaDemo deve ser 100% idempotente sem duplicar dados', async () => {
    // 1ª Execução
    await seedYeshuaDemo();

    const yeshuaOrg = await prisma.organization.findUnique({
      where: { slug: 'yeshua-contabilidade-demo' }
    });
    expect(yeshuaOrg).toBeTruthy();

    const totalClientsFirst = await prisma.person.count({
      where: { organizationId: yeshuaOrg!.id }
    });
    expect(totalClientsFirst).toBeGreaterThanOrEqual(8);

    const totalTasksFirst = await prisma.followUpTask.count({
      where: { organizationId: yeshuaOrg!.id }
    });
    expect(totalTasksFirst).toBeGreaterThanOrEqual(8);

    // 2ª Execução (Idempotência estrita: não duplica pessoas nem tarefas)
    await seedYeshuaDemo();

    const totalClientsSecond = await prisma.person.count({
      where: { organizationId: yeshuaOrg!.id }
    });
    expect(totalClientsSecond).toBe(totalClientsFirst);

    const totalTasksSecond = await prisma.followUpTask.count({
      where: { organizationId: yeshuaOrg!.id }
    });
    expect(totalTasksSecond).toBe(totalTasksFirst);
  });
});
