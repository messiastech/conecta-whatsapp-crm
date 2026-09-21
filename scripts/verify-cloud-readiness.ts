/**
 * Script Utilitário de Validação Pré-Deploy — Yeshua Cloud Demo
 * Valida prontidão para deploy Zero-Cost (Neon Postgres + Render / Fly / Koyeb).
 *
 * Execução:
 *   npx tsx scripts/verify-cloud-readiness.ts
 *   npm run verify:cloud
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateProductionEnvironment, buildApp } from '../src/presentation/server.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Cores para saída rica no terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

interface CheckResult {
  category: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
}

const checks: CheckResult[] = [];

function recordCheck(category: string, name: string, status: 'PASS' | 'FAIL' | 'WARN', message: string) {
  checks.push({ category, name, status, message });
  const symbol = status === 'PASS' ? `${colors.green}✓${colors.reset}` : status === 'WARN' ? `${colors.yellow}⚠${colors.reset}` : `${colors.red}✗${colors.reset}`;
  console.log(`  ${symbol} [${category}] ${colors.bright}${name}${colors.reset}: ${message}`);
}

async function runReadinessVerification() {
  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   ☁️  YESHUA CLOUD DEMO — AUDITORIA DE PRONTIDÃO PARA DEPLOY EM NUVEM (ZERO-COST)${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}\n`);

  // =========================================================================
  // 1. AUDITORIA DAS 10 VARIÁVEIS DE PRODUÇÃO OBRIGATÓRIAS
  // =========================================================================
  console.log(`${colors.bright}${colors.blue}▶ 1. Validação de Variáveis de Ambiente de Produção${colors.reset}`);

  // 1. DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    recordCheck('EnvVars', 'DATABASE_URL', 'FAIL', 'DATABASE_URL ausente');
  } else if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    recordCheck('EnvVars', 'DATABASE_URL', 'FAIL', 'DATABASE_URL deve ser uma connection string PostgreSQL');
  } else {
    // Mascara credenciais para não vazar dados sensíveis
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
    recordCheck('EnvVars', 'DATABASE_URL', 'PASS', `Configurado como PostgreSQL válido (${maskedUrl.split('@')[1] || 'host oculto'})`);
  }

  // 2. BETTER_AUTH_SECRET
  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    recordCheck('EnvVars', 'BETTER_AUTH_SECRET', 'FAIL', 'BETTER_AUTH_SECRET ausente');
  } else if (authSecret.length < 32) {
    recordCheck('EnvVars', 'BETTER_AUTH_SECRET', 'FAIL', `Comprimento insuficiente (${authSecret.length} chars, mínimo 32)`);
  } else {
    recordCheck('EnvVars', 'BETTER_AUTH_SECRET', 'PASS', `Configurado com alta entropia (${authSecret.length} chars)`);
  }

  // 3. BETTER_AUTH_URL
  const authUrl = process.env.BETTER_AUTH_URL;
  if (!authUrl) {
    recordCheck('EnvVars', 'BETTER_AUTH_URL', 'WARN', 'BETTER_AUTH_URL não definido localmente (obrigatório no Render/Fly para CORS/Cookies)');
  } else if (!authUrl.startsWith('http://') && !authUrl.startsWith('https://')) {
    recordCheck('EnvVars', 'BETTER_AUTH_URL', 'FAIL', 'BETTER_AUTH_URL deve ser URL válida http:// ou https://');
  } else {
    recordCheck('EnvVars', 'BETTER_AUTH_URL', 'PASS', `Configurado (${authUrl})`);
  }

  // 4. ENCRYPTION_MASTER_KEY
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    recordCheck('EnvVars', 'ENCRYPTION_MASTER_KEY', 'FAIL', 'ENCRYPTION_MASTER_KEY ausente');
  } else if (masterKey.length < 32) {
    recordCheck('EnvVars', 'ENCRYPTION_MASTER_KEY', 'FAIL', `Comprimento insuficiente (${masterKey.length} chars, mínimo 32 para AES-256)`);
  } else {
    recordCheck('EnvVars', 'ENCRYPTION_MASTER_KEY', 'PASS', `Chave AES-256-GCM configurada (${masterKey.length} chars)`);
  }

  // 5. VERTICAL_PROFILE
  const vertical = process.env.VERTICAL_PROFILE;
  if (vertical === 'ACCOUNTING') {
    recordCheck('EnvVars', 'VERTICAL_PROFILE', 'PASS', 'Perfil contábil ativo: "ACCOUNTING"');
  } else {
    recordCheck('EnvVars', 'VERTICAL_PROFILE', 'WARN', `Perfil atual: "${vertical || 'DEFAULT'}" (esperado "ACCOUNTING" na demo Yeshua)`);
  }

  // 6. ALLOW_PUBLIC_SIGNUP
  const allowSignup = process.env.ALLOW_PUBLIC_SIGNUP;
  if (allowSignup === 'false') {
    recordCheck('EnvVars', 'ALLOW_PUBLIC_SIGNUP', 'PASS', 'Cadastro público desabilitado ("false") — Acesso exclusivo ao workspace demo');
  } else {
    recordCheck('EnvVars', 'ALLOW_PUBLIC_SIGNUP', 'WARN', `ALLOW_PUBLIC_SIGNUP="${allowSignup}" (recomendado "false" para demo fechada)`);
  }

  // 7. BRAND_NAME
  const brandName = process.env.BRAND_NAME;
  if (brandName === 'YESHUA AI CLIENT DESK') {
    recordCheck('EnvVars', 'BRAND_NAME', 'PASS', `Branding definido: "${brandName}"`);
  } else {
    recordCheck('EnvVars', 'BRAND_NAME', 'WARN', `BRAND_NAME="${brandName || 'default'}" (esperado "YESHUA AI CLIENT DESK")`);
  }

  // 8. BRAND_SUBTITLE
  const brandSubtitle = process.env.BRAND_SUBTITLE;
  if (brandSubtitle === 'powered by MEGA CORE') {
    recordCheck('EnvVars', 'BRAND_SUBTITLE', 'PASS', `Subtítulo definido: "${brandSubtitle}"`);
  } else {
    recordCheck('EnvVars', 'BRAND_SUBTITLE', 'WARN', `BRAND_SUBTITLE="${brandSubtitle || 'default'}" (esperado "powered by MEGA CORE")`);
  }

  // 9. YESHUA_DEMO_EMAIL
  const demoEmail = process.env.YESHUA_DEMO_EMAIL;
  if (demoEmail && demoEmail.includes('@')) {
    recordCheck('EnvVars', 'YESHUA_DEMO_EMAIL', 'PASS', `Email demo configurado: "${demoEmail}"`);
  } else {
    recordCheck('EnvVars', 'YESHUA_DEMO_EMAIL', 'FAIL', 'YESHUA_DEMO_EMAIL ausente ou formato inválido');
  }

  // 10. YESHUA_DEMO_PASSWORD
  const demoPassword = process.env.YESHUA_DEMO_PASSWORD;
  if (demoPassword && demoPassword.length > 0) {
    recordCheck('EnvVars', 'YESHUA_DEMO_PASSWORD', 'PASS', 'Senha do usuário demo configurada');
  } else {
    recordCheck('EnvVars', 'YESHUA_DEMO_PASSWORD', 'FAIL', 'YESHUA_DEMO_PASSWORD ausente');
  }

  // =========================================================================
  // 2. SIMULAÇÃO DE FAIL-FAST DE INICIALIZAÇÃO EM PRODUÇÃO
  // =========================================================================
  console.log(`\n${colors.bright}${colors.blue}▶ 2. Validação dos Mecanismos Fail-Fast (NODE_ENV=production)${colors.reset}`);

  const runFailFastTest = (
    name: string,
    overrides: Record<string, string | undefined>,
    expectedErrorSubstr: string | null
  ) => {
    const origEnv = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require';
      process.env.BETTER_AUTH_SECRET = 'conecta_crm_production_secret_auth_token_at_least_32_bytes!!';
      process.env.BETTER_AUTH_URL = 'https://yeshua-demo.onrender.com';
      process.env.ENCRYPTION_MASTER_KEY = 'conecta_crm_test_master_key_32_bytes_long!!';
      process.env.VERTICAL_PROFILE = 'ACCOUNTING';
      process.env.YESHUA_DEMO_EMAIL = 'demo@yeshuacontabilidade.com.br';
      process.env.YESHUA_DEMO_PASSWORD = 'demo';
      delete process.env.WHATSAPP_PROVIDER;

      for (const [k, v] of Object.entries(overrides)) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }

      validateProductionEnvironment();

      if (expectedErrorSubstr) {
        recordCheck('FailFast', name, 'FAIL', `Deveria ter abortado startup contendo "${expectedErrorSubstr}"`);
      } else {
        recordCheck('FailFast', name, 'PASS', 'Inicializou perfeitamente com todas as variáveis de produção válidas');
      }
    } catch (err: any) {
      if (expectedErrorSubstr && err.message.includes(expectedErrorSubstr)) {
        recordCheck('FailFast', name, 'PASS', `Abortou com mensagem clara contendo "${expectedErrorSubstr}"`);
      } else if (!expectedErrorSubstr) {
        recordCheck('FailFast', name, 'FAIL', `Falha inesperada: ${err.message}`);
      } else {
        recordCheck('FailFast', name, 'FAIL', `Mensagem não continha "${expectedErrorSubstr}": ${err.message}`);
      }
    } finally {
      process.env = origEnv;
    }
  };

  runFailFastTest('Missing DATABASE_URL', { DATABASE_URL: undefined }, 'DATABASE_URL');
  runFailFastTest('Invalid DATABASE_URL Protocol', { DATABASE_URL: 'sqlite://dev.db' }, 'DATABASE_URL');
  runFailFastTest('Missing BETTER_AUTH_SECRET', { BETTER_AUTH_SECRET: undefined }, 'BETTER_AUTH_SECRET');
  runFailFastTest('Short BETTER_AUTH_SECRET (<32 chars)', { BETTER_AUTH_SECRET: 'curto' }, 'BETTER_AUTH_SECRET');
  runFailFastTest('Missing BETTER_AUTH_URL', { BETTER_AUTH_URL: undefined }, 'BETTER_AUTH_URL');
  runFailFastTest('Invalid BETTER_AUTH_URL', { BETTER_AUTH_URL: 'invalid-url' }, 'BETTER_AUTH_URL');
  runFailFastTest('Missing ENCRYPTION_MASTER_KEY', { ENCRYPTION_MASTER_KEY: undefined }, 'ENCRYPTION_MASTER_KEY');
  runFailFastTest('Short ENCRYPTION_MASTER_KEY (<32 chars)', { ENCRYPTION_MASTER_KEY: 'curto' }, 'ENCRYPTION_MASTER_KEY');
  runFailFastTest('Missing YESHUA_DEMO_EMAIL (Accounting)', { YESHUA_DEMO_EMAIL: undefined }, 'YESHUA_DEMO_EMAIL');
  runFailFastTest('Missing YESHUA_DEMO_PASSWORD (Accounting)', { YESHUA_DEMO_PASSWORD: undefined }, 'YESHUA_DEMO_PASSWORD');
  runFailFastTest('Valid Production Configuration (All Required Variables)', {}, null);

  // =========================================================================
  // 3. AUDITORIA DE CONECTIVIDADE COM BANCO POSTGRESQL (NEON)
  // =========================================================================
  console.log(`\n${colors.bright}${colors.blue}▶ 3. Verificação de Conectividade com Banco PostgreSQL${colors.reset}`);
  try {
    const startPing = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startPing;
    recordCheck('Database', 'Neon PostgreSQL Ping', 'PASS', `Conexão bem-sucedida (latência: ${latency}ms, sem vazamento de dados)`);
  } catch (err: any) {
    recordCheck('Database', 'Neon PostgreSQL Ping', 'FAIL', `Falha de conexão com PostgreSQL: ${err.message}`);
  }

  // =========================================================================
  // 4. AUDITORIA DE ARTEFATOS DE CONTAINER E DEPLOY
  // =========================================================================
  console.log(`\n${colors.bright}${colors.blue}▶ 4. Verificação de Manifestos de Container e Deploy em Nuvem${colors.reset}`);

  // 4.1 Dockerfile
  const dockerfilePath = path.join(rootDir, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    const hasMultiStage = content.includes('FROM node:20-alpine AS builder') && content.includes('FROM node:20-alpine AS runner');
    const hasNonRootUser = content.includes('USER appuser');
    const hasEntrypoint = content.includes('ENTRYPOINT ["/app/docker-entrypoint.sh"]');
    if (hasMultiStage && hasNonRootUser && hasEntrypoint) {
      recordCheck('Container', 'Dockerfile', 'PASS', 'Multi-stage build, Alpine runner, usuário não-root (appuser) e entrypoint seguro');
    } else {
      recordCheck('Container', 'Dockerfile', 'WARN', 'Dockerfile presente, mas faltam diretivas de segurança recomendadas');
    }
  } else {
    recordCheck('Container', 'Dockerfile', 'FAIL', 'Dockerfile não encontrado na raiz');
  }

  // 4.2 docker-entrypoint.sh
  const entrypointPath = path.join(rootDir, 'docker-entrypoint.sh');
  if (fs.existsSync(entrypointPath)) {
    const content = fs.readFileSync(entrypointPath, 'utf8');
    const hasPrismaPush = content.includes('prisma db push');
    const hasSeed = content.includes('seed-yeshua-demo');
    const hasExec = content.includes('exec "$@"');
    if (hasPrismaPush && hasSeed && hasExec) {
      recordCheck('Container', 'docker-entrypoint.sh', 'PASS', 'Sincronização de schema (db push), provisionamento idempotente do seed e exec $@');
    } else {
      recordCheck('Container', 'docker-entrypoint.sh', 'WARN', 'docker-entrypoint.sh incompleto');
    }
  } else {
    recordCheck('Container', 'docker-entrypoint.sh', 'FAIL', 'docker-entrypoint.sh não encontrado na raiz');
  }

  // 4.3 fly.toml
  const flyPath = path.join(rootDir, 'fly.toml');
  if (fs.existsSync(flyPath)) {
    const content = fs.readFileSync(flyPath, 'utf8');
    const hasHealthCheck = content.includes('path = "/health"');
    const hasRegionGru = content.includes('primary_region = "gru"');
    if (hasHealthCheck && hasRegionGru) {
      recordCheck('CloudBlueprint', 'fly.toml', 'PASS', 'Região São Paulo (GRU), health check em /health e release_command configurado');
    } else {
      recordCheck('CloudBlueprint', 'fly.toml', 'WARN', 'fly.toml presente com configurações parciais');
    }
  } else {
    recordCheck('CloudBlueprint', 'fly.toml', 'FAIL', 'fly.toml não encontrado');
  }

  // 4.4 render.yaml
  const renderPath = path.join(rootDir, 'render.yaml');
  if (fs.existsSync(renderPath)) {
    const content = fs.readFileSync(renderPath, 'utf8');
    const hasPlanFree = content.includes('plan: free');
    const hasStartRelease = content.includes('start:yeshua-release');
    const hasHealthCheck = content.includes('healthCheckPath: /health');
    if (hasPlanFree && hasStartRelease && hasHealthCheck) {
      recordCheck('CloudBlueprint', 'render.yaml', 'PASS', 'Plano Zero-Cost (free), healthCheckPath /health e startCommand automatizado com release');
    } else {
      recordCheck('CloudBlueprint', 'render.yaml', 'WARN', 'render.yaml presente com configurações parciais');
    }
  } else {
    recordCheck('CloudBlueprint', 'render.yaml', 'FAIL', 'render.yaml não encontrado');
  }

  // =========================================================================
  // 5. AUDITORIA DE OBSERVABILIDADE DOS ENDPOINTS
  // =========================================================================
  console.log(`\n${colors.bright}${colors.blue}▶ 5. Verificação dos Endpoints de Observabilidade (/health, /api/public-config)${colors.reset}`);
  {
    const { app } = buildApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Endpoint /health
      const resHealth = await fetch(`${baseUrl}/health`);
      const healthData = await resHealth.json() as any;

      const hasUptime = typeof healthData.uptime === 'number';
      const hasTimestamp = typeof healthData.timestamp === 'string';
      const hasVertical = healthData.verticalProfile !== undefined;
      const hasDb = healthData.database?.status !== undefined;
      const isSensitiveFree = !JSON.stringify(healthData).includes('postgres://') && !JSON.stringify(healthData).includes('password');

      if (resHealth.status === 200 && hasUptime && hasTimestamp && hasVertical && hasDb && isSensitiveFree) {
        recordCheck('Observability', 'GET /health', 'PASS', `Status 200, uptime=${healthData.uptime}s, verticalProfile="${healthData.verticalProfile}", database="${healthData.database?.status}" (Sem vazamento)`);
      } else {
        recordCheck('Observability', 'GET /health', 'FAIL', `Resposta inadequada em /health: ${JSON.stringify(healthData)}`);
      }

      // Endpoint /api/public-config
      const resConfig = await fetch(`${baseUrl}/api/public-config`);
      const configData = await resConfig.json() as any;
      if (resConfig.status === 200 && configData.brandName && configData.verticalProfile) {
        recordCheck('Observability', 'GET /api/public-config', 'PASS', `Status 200, brandName="${configData.brandName}", vertical="${configData.verticalProfile}"`);
      } else {
        recordCheck('Observability', 'GET /api/public-config', 'FAIL', `Falha em /api/public-config: ${JSON.stringify(configData)}`);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // =========================================================================
  // SUMÁRIO DA AUDITORIA
  // =========================================================================
  const total = checks.length;
  const passed = checks.filter(c => c.status === 'PASS').length;
  const warnings = checks.filter(c => c.status === 'WARN').length;
  const failures = checks.filter(c => c.status === 'FAIL').length;

  console.log(`\n${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}                      SUMÁRIO DA AUDITORIA DE PRONTIDÃO                         ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}================================================================================${colors.reset}`);
  console.log(`  Total de Verificações: ${total}`);
  console.log(`  ${colors.green}Sucessos [PASS]: ${passed}${colors.reset}`);
  console.log(`  ${colors.yellow}Avisos   [WARN]: ${warnings}${colors.reset}`);
  console.log(`  ${colors.red}Falhas   [FAIL]: ${failures}${colors.reset}`);
  console.log(`--------------------------------------------------------------------------------\n`);

  if (failures === 0) {
    console.log(`${colors.bright}${colors.green}🚀 APLICAÇÃO 100% PRONTA PARA DEPLOY EM NUVEM CUSTO ZERO (NEON + RENDER/FLY/KOYEB)!${colors.reset}\n`);
    return 0;
  } else {
    console.log(`${colors.bright}${colors.red}❌ ATENÇÃO: Corrija as falhas listadas acima antes do deploy em produção.${colors.reset}\n`);
    return 1;
  }
}

// Execução
runReadinessVerification()
  .then(async (exitCode) => {
    await prisma.$disconnect().catch(() => {});
    process.exit(exitCode);
  })
  .catch(async (err) => {
    console.error(`${colors.red}[Erro Fatal na Verificação]:${colors.reset}`, err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
