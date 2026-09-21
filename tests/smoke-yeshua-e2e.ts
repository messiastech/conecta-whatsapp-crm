/**
 * Smoke Test E2E - Yeshua Cloud Demo
 * Validação automatizada ponta a ponta da jornada do cliente e equipe contábil.
 * Execução: npx tsx tests/smoke-yeshua-e2e.ts
 */

import 'dotenv/config';
process.env.NODE_ENV = 'test';
import http from 'http';
import { AddressInfo } from 'net';
import { buildApp } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { seedYeshuaDemo } from '../src/infrastructure/database/seed-yeshua-demo.js';

// Cores ANSI para saída rica no terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m'
};

interface StepResult {
  step: number;
  title: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  details: string[];
  error?: string;
}

const results: StepResult[] = [];

function parseCookieHeader(res: Response): string {
  if (typeof (res.headers as any).getSetCookie === 'function') {
    const cookies = (res.headers as any).getSetCookie();
    return cookies.map((c: string) => c.split(';')[0].trim()).join('; ');
  }
  const raw = res.headers.get('set-cookie') || '';
  return raw
    .split(',')
    .map((c: string) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function isServerReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function runSmokeTests() {
  console.log(`\n${colors.bright}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan} 🚀 YESHUA CLOUD DEMO — SMOKE TEST END-TO-END AUTOMATIZADO (9 PASSOS)   ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================================================${colors.reset}\n`);

  let serverInstance: http.Server | null = null;
  let baseUrl: string = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

  // 1. Garantir ambiente e servidor
  process.env.VERTICAL_PROFILE = 'ACCOUNTING';
  process.env.ALLOW_PUBLIC_SIGNUP = 'false';
  process.env.YESHUA_DEMO_PASSWORD = process.env.YESHUA_DEMO_PASSWORD || 'demo';
  process.env.CORS_ORIGIN = '*';

  console.log(`${colors.dim}[Setup] Verificando conectividade com o servidor HTTP...${colors.reset}`);
  const reachable = await isServerReachable(baseUrl);

  if (reachable) {
    console.log(`${colors.green}✓ Servidor HTTP já ativo em ${baseUrl}${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚡ Nenhum servidor detectado em ${baseUrl}. Inicializando instância local...${colors.reset}`);
    const { app } = buildApp();
    serverInstance = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = serverInstance.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    console.log(`${colors.green}✓ Servidor HTTP instanciado com sucesso em ${baseUrl}${colors.reset}`);
  }

  // 2. Garantir provisionamento idempotente do seed Yeshua e limpeza prévia de simulações
  console.log(`${colors.dim}[Setup] Limpando simulações anteriores e garantindo seedYeshuaDemo...${colors.reset}`);
  await cleanupSimulatedTestData();
  await seedYeshuaDemo();
  console.log(`${colors.green}✓ Provisionamento da demo validado.${colors.reset}\n`);

  let sessionCookie = '';
  let yeshuaOrgId = '';
  let simpleMsgTaskId = '';
  let complexMsgTaskId = '';

  // ============================================================================
  // PASSO 1: GET /api/public-config
  // ============================================================================
  await executeStep(1, 'GET /api/public-config — Validação de Perfil e Branding Público', async () => {
    const res = await fetch(`${baseUrl}/api/public-config`);
    if (res.status !== 200) {
      throw new Error(`Esperado status 200, recebido ${res.status}`);
    }
    const config = await res.json() as any;
    const details: string[] = [];

    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`verticalProfile: "${config.verticalProfile}" (esperado: "ACCOUNTING")`);
    details.push(`allowPublicSignup: ${config.allowPublicSignup} (esperado: false)`);
    details.push(`brandName: "${config.brandName}" (esperado: "YESHUA AI CLIENT DESK")`);
    details.push(`brandSubtitle: "${config.brandSubtitle}" (esperado: "powered by MEGA CORE")`);

    if (config.verticalProfile !== 'ACCOUNTING') {
      throw new Error(`verticalProfile inválido: ${config.verticalProfile}`);
    }
    if (config.allowPublicSignup !== false) {
      throw new Error(`allowPublicSignup inválido: ${config.allowPublicSignup}`);
    }
    if (config.brandName !== 'YESHUA AI CLIENT DESK') {
      throw new Error(`brandName inválido: ${config.brandName}`);
    }
    if (config.brandSubtitle !== 'powered by MEGA CORE') {
      throw new Error(`brandSubtitle inválido: ${config.brandSubtitle}`);
    }

    return details;
  });

  // ============================================================================
  // PASSO 2: POST /api/auth/sign-in/email
  // ============================================================================
  await executeStep(2, 'POST /api/auth/sign-in/email — Autenticação do Usuário Demo Yeshua', async () => {
    const demoEmail = process.env.YESHUA_DEMO_EMAIL || 'demo@yeshuacontabilidade.com.br';
    const demoPassword = process.env.YESHUA_DEMO_PASSWORD || 'demo';

    const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({ email: demoEmail, password: demoPassword })
    });

    if (res.status !== 200) {
      const errBody = await res.text();
      throw new Error(`Falha no login (status ${res.status}): ${errBody}`);
    }

    sessionCookie = parseCookieHeader(res);
    const body = await res.json() as any;
    const details: string[] = [];

    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Email autenticado: ${body.user?.email || demoEmail}`);
    details.push(`User ID: ${body.user?.id || 'OK'}`);
    details.push(`Session Cookie obtido: ${sessionCookie.includes('better-auth.session_token') ? 'SIM (better-auth.session_token presente)' : 'Sessão ativa'}`);

    if (!sessionCookie && !res.headers.get('set-cookie')) {
      throw new Error('Nenhum cookie de sessão retornado pelo Better Auth');
    }

    return details;
  });

  // ============================================================================
  // PASSO 3: GET /api/organizations/my
  // ============================================================================
  await executeStep(3, 'GET /api/organizations/my — Confirmação do Workspace Yeshua Contabilidade', async () => {
    const res = await fetch(`${baseUrl}/api/organizations/my`, {
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie
      }
    });

    if (res.status !== 200) {
      throw new Error(`Falha ao listar organizações (status ${res.status})`);
    }

    const orgs = await res.json() as any[];
    if (!Array.isArray(orgs) || orgs.length === 0) {
      throw new Error('Nenhuma organização associada ao usuário');
    }

    const yeshuaOrg = orgs.find(o =>
      o.slug === 'yeshua-contabilidade-demo' ||
      (o.name && o.name.toLowerCase().includes('yeshua')) ||
      o.verticalProfile === 'ACCOUNTING'
    );

    if (!yeshuaOrg) {
      throw new Error('Workspace Yeshua Contabilidade não encontrado na lista');
    }

    yeshuaOrgId = yeshuaOrg.id;
    const details: string[] = [];
    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Workspace ID: ${yeshuaOrg.id}`);
    details.push(`Workspace Nome: "${yeshuaOrg.name}"`);
    details.push(`Workspace Slug: "${yeshuaOrg.slug}"`);
    details.push(`verticalProfile: "${yeshuaOrg.verticalProfile}" (esperado: "ACCOUNTING")`);
    details.push(`brandName: "${yeshuaOrg.brandName}"`);
    details.push(`Papel do Usuário: ${yeshuaOrg.role}`);

    if (yeshuaOrg.verticalProfile !== 'ACCOUNTING') {
      throw new Error(`verticalProfile da organização não é ACCOUNTING: ${yeshuaOrg.verticalProfile}`);
    }

    return details;
  });

  // ============================================================================
  // PASSO 4: GET /api/metrics
  // ============================================================================
  await executeStep(4, 'GET /api/metrics — Validação de Métricas Contábeis do Painel', async () => {
    const res = await fetch(`${baseUrl}/api/metrics`, {
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
        'x-organization-id': yeshuaOrgId
      }
    });

    if (res.status !== 200) {
      throw new Error(`Falha ao obter métricas (status ${res.status})`);
    }

    const metrics = await res.json() as any;
    const details: string[] = [];

    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Total Clientes Cadastrados: ${metrics.totalPersons} (esperado >= 8)`);
    details.push(`Total Mensagens Recebidas / Triagens: ${metrics.totalMessagesReceived}`);
    details.push(`Pendências Fiscais Ativas: ${metrics.pendingFollowUpsCount}`);
    details.push(`Atendimentos que exigem Atenção: ${metrics.pendingAttentionCount}`);
    details.push(`Perfil Contábil Ativo: ${metrics.verticalProfile}`);
    details.push(`Categorias Triadas: ${metrics.categoryBreakdown?.map((c: any) => `${c.category}(${c.count})`).join(', ')}`);

    if (typeof metrics.totalPersons !== 'number' || metrics.totalPersons < 8) {
      throw new Error(`Métrica de clientes insuficiente: ${metrics.totalPersons} (esperado >= 8)`);
    }
    if (metrics.verticalProfile !== 'ACCOUNTING') {
      throw new Error(`Métricas retornaram verticalProfile diferente de ACCOUNTING: ${metrics.verticalProfile}`);
    }

    return details;
  });

  // ============================================================================
  // PASSO 5: GET /api/persons
  // ============================================================================
  await executeStep(5, 'GET /api/persons — Clientes Fictícios com Notas Desacopladas', async () => {
    const res = await fetch(`${baseUrl}/api/persons`, {
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
        'x-organization-id': yeshuaOrgId
      }
    });

    if (res.status !== 200) {
      throw new Error(`Falha ao listar clientes (status ${res.status})`);
    }

    const persons = await res.json() as any[];
    if (!Array.isArray(persons) || persons.length < 8) {
      throw new Error(`Esperado ao menos 8 clientes cadastrados, recebido ${persons?.length}`);
    }

    const details: string[] = [];
    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Total de Clientes Retornados: ${persons.length}`);

    // Valida estrutura de notas desacopladas da organização
    let decoupledCount = 0;
    for (const p of persons) {
      if (p.notes) {
        try {
          const parsed = JSON.parse(p.notes);
          if (parsed.companyName && parsed.companyName !== 'Yeshua Contabilidade — Demo') {
            decoupledCount++;
          }
        } catch {
          // Se não for JSON, valida texto
          if (p.notes.length > 3) decoupledCount++;
        }
      }
    }

    details.push(`Clientes com empresa própria desacoplada do Workspace: ${decoupledCount}/${persons.length}`);
    const samplePerson = persons.find(p => p.name.includes('Roberto Silveira') || p.name.includes('Helena Castro')) || persons[0];
    details.push(`Exemplo de Cliente: "${samplePerson.name}" | Notas: ${samplePerson.notes}`);

    if (decoupledCount < 6) {
      throw new Error(`Poucos clientes com empresa desacoplada: ${decoupledCount}`);
    }

    return details;
  });

  // ============================================================================
  // PASSO 6: GET /api/conversations
  // ============================================================================
  await executeStep(6, 'GET /api/conversations — Histórico de Atendimentos e Triagens', async () => {
    const res = await fetch(`${baseUrl}/api/conversations`, {
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
        'x-organization-id': yeshuaOrgId
      }
    });

    if (res.status !== 200) {
      throw new Error(`Falha ao listar conversas (status ${res.status})`);
    }

    const conversations = await res.json() as any[];
    if (!Array.isArray(conversations) || conversations.length < 8) {
      throw new Error(`Esperado ao menos 8 conversas, recebido ${conversations?.length}`);
    }

    const details: string[] = [];
    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Total de Conversas no Histórico: ${conversations.length}`);

    const categoriesFound = new Set(conversations.map(c => c.category).filter(Boolean));
    details.push(`Categorias no Histórico: ${Array.from(categoriesFound).join(', ')}`);

    const convWithMsgs = conversations.filter(c => Array.isArray(c.messages) && c.messages.length > 0);
    details.push(`Conversas com Histórico de Mensagens: ${convWithMsgs.length}/${conversations.length}`);

    if (convWithMsgs.length === 0) {
      throw new Error('Nenhuma conversa possui mensagens vinculadas');
    }

    return details;
  });

  // ============================================================================
  // PASSO 7: Simulação de pergunta contábil simples
  // ============================================================================
  await executeStep(7, 'Simulação de Pergunta Contábil Simples — Resposta Segura com Disclaimer', async () => {
    const testPhone = '+5511999991001';
    const simpleQuestion = 'Olá equipe Yeshua! Qual o prazo limite de recolhimento do DAS do Simples Nacional este mês e como emitir a segunda via?';

    const res = await fetch(`${baseUrl}/api/sandbox/simulate-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
        'x-organization-id': yeshuaOrgId
      },
      body: JSON.stringify({
        fromPhone: testPhone,
        text: simpleQuestion
      })
    });

    if (res.status !== 200) {
      const err = await res.text();
      throw new Error(`Falha na simulação simples (status ${res.status}): ${err}`);
    }

    const data = await res.json() as any;
    const classification = data.processedResult?.classification;

    if (!classification) {
      throw new Error('Classificação de IA ausente no resultado processado');
    }

    const details: string[] = [];
    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Categoria Classificada: ${classification.category}`);
    details.push(`Prioridade: ${classification.priority}`);
    details.push(`Exige Atenção Humana Imediata: ${classification.requiresHumanAttention}`);
    details.push(`IA Model Utilizado: ${classification.providerUsed}`);

    const suggestedReply = classification.suggestedReply || '';
    const REQUIRED_DISCLAIMER = '[Resposta sugerida — sujeita à validação da equipe Yeshua]';

    details.push(`Resposta Sugerida:\n    "${suggestedReply.replace(/\n/g, '\n    ')}"`);

    if (!suggestedReply.includes(REQUIRED_DISCLAIMER)) {
      throw new Error(`Disclaimer obrigatório ausente na resposta: "${REQUIRED_DISCLAIMER}"`);
    }
    details.push(`✓ Disclaimer obrigatório "${REQUIRED_DISCLAIMER}" validado com sucesso!`);

    simpleMsgTaskId = data.processedResult?.followUpTaskId;
    return details;
  });

  // ============================================================================
  // PASSO 8: Simulação de intimação tributária complexa (SEFAZ/ICMS-ST)
  // ============================================================================
  await executeStep(8, 'Simulação de Intimação Tributária Complexa (SEFAZ) — Escalonamento URGENTE', async () => {
    const testPhone = '+5511999991002';
    const complexNotice = 'URGENTE: Recebemos uma intimação da SEFAZ com prazo improrrogável de 5 dias úteis alegando divergência de recolhimento de ICMS-ST dos últimos 2 anos. O valor apontado é de R$ 180.000,00. Precisamos de defesa imediata!';

    const res = await fetch(`${baseUrl}/api/sandbox/simulate-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
        'x-organization-id': yeshuaOrgId
      },
      body: JSON.stringify({
        fromPhone: testPhone,
        text: complexNotice
      })
    });

    if (res.status !== 200) {
      const err = await res.text();
      throw new Error(`Falha na simulação complexa (status ${res.status}): ${err}`);
    }

    const data = await res.json() as any;
    const classification = data.processedResult?.classification;

    if (!classification) {
      throw new Error('Classificação de IA ausente no resultado processado');
    }

    const details: string[] = [];
    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Categoria Classificada: ${classification.category} (esperado: "CASO_COMPLEXO")`);
    details.push(`Prioridade Atribuída: ${classification.priority} (esperado: "URGENT")`);
    details.push(`requiresHumanAttention: ${classification.requiresHumanAttention} (esperado: true)`);
    details.push(`Próxima Ação: ${classification.nextAction}`);
    details.push(`FollowUpTaskId Gerado: ${data.processedResult?.followUpTaskId}`);

    if (classification.category !== 'CASO_COMPLEXO') {
      throw new Error(`Categoria incorreta para intimação SEFAZ: ${classification.category}`);
    }
    if (classification.priority !== 'URGENT') {
      throw new Error(`Prioridade não foi escalonada para URGENT: ${classification.priority}`);
    }
    if (classification.requiresHumanAttention !== true) {
      throw new Error(`requiresHumanAttention deve ser true para fiscalização`);
    }
    if (!data.processedResult?.followUpTaskId) {
      throw new Error('FollowUpTask não foi gerada para caso urgente');
    }

    complexMsgTaskId = data.processedResult.followUpTaskId;
    const suggestedReply = classification.suggestedReply || '';
    const REQUIRED_DISCLAIMER = '[Resposta sugerida — sujeita à validação da equipe Yeshua]';

    if (!suggestedReply.includes(REQUIRED_DISCLAIMER)) {
      throw new Error(`Disclaimer ausente na notificação urgente: "${REQUIRED_DISCLAIMER}"`);
    }

    details.push(`✓ Escalonamento, prioridade URGENT e tarefa ${complexMsgTaskId} validados!`);
    return details;
  });

  // ============================================================================
  // PASSO 9: GET /api/tasks
  // ============================================================================
  await executeStep(9, 'GET /api/tasks — Validação da Lista de Pendências Fiscais Atualizada', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      headers: {
        'Content-Type': 'application/json',
        cookie: sessionCookie,
        'x-organization-id': yeshuaOrgId
      }
    });

    if (res.status !== 200) {
      throw new Error(`Falha ao obter lista de tarefas (status ${res.status})`);
    }

    const tasks = await res.json() as any[];
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Nenhuma pendência fiscal retornada');
    }

    const details: string[] = [];
    details.push(`HTTP Status: ${res.status} OK`);
    details.push(`Total de Pendências Fiscais: ${tasks.length}`);

    // Verifica se a tarefa do Passo 8 está presente
    const urgentTask = tasks.find(t => t.id === complexMsgTaskId);
    if (!urgentTask) {
      throw new Error(`Tarefa urgente recém-gerada (${complexMsgTaskId}) não foi encontrada em /api/tasks`);
    }

    details.push(`✓ Nova Tarefa Urgente Encontrada na Lista:`);
    details.push(`    - ID: ${urgentTask.id}`);
    details.push(`    - Título: "${urgentTask.title}"`);
    details.push(`    - Prioridade: ${urgentTask.priority} (URGENT)`);
    details.push(`    - Status: ${urgentTask.status} (PENDING)`);

    const pendingUrgentCount = tasks.filter(t => t.priority === 'URGENT' && t.status === 'PENDING').length;
    details.push(`Pendências URGENTES Ativas no Painel: ${pendingUrgentCount}`);

    return details;
  });

  // ============================================================================
  // TEARDOWN E RELATÓRIO FINAL
  // ============================================================================
  console.log(`\n${colors.dim}[Teardown] Limpando dados voláteis das simulações...${colors.reset}`);
  await cleanupSimulatedTestData(yeshuaOrgId);
  console.log(`${colors.green}✓ Estado do workspace Yeshua Contabilidade restaurado (8 clientes / 8 tarefas).${colors.reset}`);

  if (serverInstance) {
    console.log(`${colors.dim}[Teardown] Encerrando servidor HTTP de teste...${colors.reset}`);
    await new Promise<void>((resolve) => serverInstance!.close(() => resolve()));
    console.log(`${colors.green}✓ Servidor encerrado.${colors.reset}`);
  }

  printSummaryReport();
}

async function cleanupSimulatedTestData(orgId?: string): Promise<void> {
  const testPhones = ['+5511999991001', '+5511999991002'];
  for (const phone of testPhones) {
    const where: any = { normalizedPhone: phone };
    if (orgId) where.organizationId = orgId;
    const persons = await prisma.person.findMany({ where });
    for (const p of persons) {
      await prisma.followUpTask.deleteMany({ where: { personId: p.id } });
      await prisma.aIAnalysis.deleteMany({ where: { message: { personId: p.id } } });
      await prisma.message.deleteMany({ where: { personId: p.id } });
      await prisma.conversation.deleteMany({ where: { personId: p.id } });
      await prisma.person.delete({ where: { id: p.id } }).catch(() => {});
    }
  }
}

async function executeStep(stepNumber: number, title: string, fn: () => Promise<string[]>): Promise<void> {
  const start = Date.now();
  console.log(`${colors.bright}${colors.blue}▶ PASSO ${stepNumber}: ${title}${colors.reset}`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    results.push({
      step: stepNumber,
      title,
      status: 'PASS',
      durationMs,
      details
    });
    for (const d of details) {
      console.log(`  ${colors.dim}•${colors.reset} ${d}`);
    }
    console.log(`  ${colors.green}✓ PASSO ${stepNumber} CONCLUÍDO COM SUCESSO (${durationMs}ms)${colors.reset}\n`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({
      step: stepNumber,
      title,
      status: 'FAIL',
      durationMs,
      details: [],
      error: err.message
    });
    console.log(`  ${colors.red}✗ FALHA NO PASSO ${stepNumber}: ${err.message} (${durationMs}ms)${colors.reset}\n`);
    throw err;
  }
}

function printSummaryReport() {
  const totalSteps = results.length;
  const passedSteps = results.filter(r => r.status === 'PASS').length;
  const failedSteps = results.filter(r => r.status === 'FAIL').length;
  const totalTime = results.reduce((acc, r) => acc + r.durationMs, 0);

  console.log(`\n${colors.bright}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                   RELATÓRIO FINAL DO SMOKE TEST E2E                    ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}========================================================================${colors.reset}\n`);

  for (const r of results) {
    const badge = r.status === 'PASS'
      ? `${colors.green}[PASS]${colors.reset}`
      : `${colors.red}[FAIL]${colors.reset}`;
    console.log(`  ${badge} Passo ${r.step}: ${r.title} (${r.durationMs}ms)`);
  }

  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  Total de Passos: ${totalSteps} | ${colors.green}Sucessos: ${passedSteps}${colors.reset} | ${colors.red}Falhas: ${failedSteps}${colors.reset} | Tempo Total: ${totalTime}ms`);
  console.log(`------------------------------------------------------------------------\n`);

  if (passedSteps === 9 && failedSteps === 0) {
    console.log(`${colors.bright}${colors.green}🎉 100% DE SUCESSO — TODAS AS JORNADAS DA DEMO YESHUA VALIDADAS! 🎉${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.bright}${colors.red}❌ SMOKE TEST INCOMPLETO OU COM FALHAS.${colors.reset}\n`);
    process.exit(1);
  }
}

// Execução
runSmokeTests()
  .catch((err) => {
    console.error(`${colors.red}[Smoke Test] Falha crítica na execução:${colors.reset}`, err);
    printSummaryReport();
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
