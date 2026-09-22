/**
 * Script & Runner de Teste de Contrato do GPN Real (sem dependência de mocks)
 *
 * Valida o handshake oficial contra a API do GPN Core Gateway:
 *  1. Cria sessão no GPN Core Gateway (POST /api/v1/sessions);
 *  2. Obtém QR Code real;
 *  3. Valida contrato de resposta JSON (ok, status, qr);
 *  4. Registra evidência formal da recepção do QR Code em disco (reports/gpn-contract-evidence.json)
 *     e no console.
 *
 * Configuração via variáveis de ambiente:
 *  - GPN_API_URL: URL base do GPN Core Gateway (ex: http://localhost:3000 ou https://gpn.infra.conecta.internal)
 *  - GPN_API_KEY: Chave de autenticação Bearer
 *  - GPN_TEST_SESSION_ID: ID customizado para o teste (opcional)
 *
 * Execução:
 *  npx tsx scripts/test-real-gpn-contract.ts
 *  npm run test:gpn:contract
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export interface GpnContractEvidence {
  timestamp: string;
  targetUrl: string;
  sessionId: string;
  httpStatus: number;
  contractValidation: {
    hasOkField: boolean;
    okIsTrue: boolean;
    hasStatusField: boolean;
    statusValue: string;
    hasValidQr: boolean;
    qrLength: number;
    qrPreview: string;
    allPassed: boolean;
  };
  rawResponseSummary: Record<string, any>;
}

export interface GpnContractTestOptions {
  apiUrl?: string;
  apiKey?: string;
  sessionId?: string;
  evidenceFilePath?: string;
  verbose?: boolean;
}

export async function runRealGpnContractTest(options?: GpnContractTestOptions): Promise<{
  success: boolean;
  evidence: GpnContractEvidence;
  error?: string;
}> {
  const apiUrl = (options?.apiUrl || process.env.GPN_API_URL || '').replace(/\/+$/, '');
  const apiKey = options?.apiKey || process.env.GPN_API_KEY || '';
  const sessionId = options?.sessionId || process.env.GPN_TEST_SESSION_ID || `contract-test-${Date.now()}`;
  const verbose = options?.verbose ?? true;

  if (!apiUrl) {
    throw new Error('GPN_API_URL não fornecida. Configure a variável de ambiente GPN_API_URL ou passe no parâmetro.');
  }
  if (!apiKey) {
    throw new Error('GPN_API_KEY não fornecida. Configure a variável de ambiente GPN_API_KEY ou passe no parâmetro.');
  }

  if (verbose) {
    console.log('\n================================================================');
    console.log('   📡  TESTE DE CONTRATO DO GPN REAL (GATEWAY HANDSHAKE)        ');
    console.log('================================================================');
    console.log(`▶ Alvo GPN Gateway:  ${apiUrl}`);
    console.log(`▶ Sessão de Teste:   ${sessionId}`);
    console.log(`▶ Chave de Acesso:   ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log('----------------------------------------------------------------\n');
  }

  const endpoint = `${apiUrl}/api/v1/sessions`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (err: any) {
    const errorMsg = `Falha na conexão de rede com o GPN em ${endpoint}: ${err.message}`;
    if (verbose) console.error(`❌ [ERRO DE REDE] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const rawText = await response.text();
  let json: any = {};
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`O GPN retornou corpo de resposta inválido (não-JSON, status HTTP ${response.status}): ${rawText.substring(0, 200)}`);
  }

  const qr = json.qr || json.qrcode || '';
  const status = json.status || '';

  const validation = {
    hasOkField: typeof json.ok === 'boolean',
    okIsTrue: json.ok === true,
    hasStatusField: typeof status === 'string' && status.length > 0,
    statusValue: status,
    hasValidQr: typeof qr === 'string' && qr.length > 10,
    qrLength: qr.length,
    qrPreview: qr ? `${qr.substring(0, 40)}...` : '(ausente)',
    allPassed: false
  };

  validation.allPassed =
    response.ok &&
    validation.hasOkField &&
    validation.okIsTrue &&
    validation.hasStatusField &&
    validation.hasValidQr;

  const evidence: GpnContractEvidence = {
    timestamp: new Date().toISOString(),
    targetUrl: apiUrl,
    sessionId,
    httpStatus: response.status,
    contractValidation: validation,
    rawResponseSummary: {
      ok: json.ok,
      status: json.status,
      hasQr: Boolean(qr),
      phone: json.phone || null
    }
  };

  // Salva evidência formal em disco
  const defaultEvidenceDir = path.join(projectRoot, 'reports');
  const evidencePath = options?.evidenceFilePath || path.join(defaultEvidenceDir, 'gpn-contract-evidence.json');

  try {
    const dir = path.dirname(evidencePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
    if (verbose) {
      console.log(`📁 Evidência formal registrada em: ${evidencePath}`);
    }
  } catch (err: any) {
    if (verbose) console.warn(`⚠️ Não foi possível salvar arquivo de evidência: ${err.message}`);
  }

  if (verbose) {
    console.log('\n--- RESULTADO DA VALIDAÇÃO DO CONTRATO GPN ---');
    console.log(`Status HTTP:         ${response.status} ${response.status === 200 ? '✓' : '✗'}`);
    console.log(`Campo 'ok':          ${json.ok} ${validation.okIsTrue ? '✓' : '✗'}`);
    console.log(`Campo 'status':      ${status} ${validation.hasStatusField ? '✓' : '✗'}`);
    console.log(`Campo 'qr':          ${validation.qrLength} caracteres ${validation.hasValidQr ? '✓' : '✗'}`);
    console.log(`Preview QR Code:     ${validation.qrPreview}`);
    console.log('------------------------------------------------');
    if (validation.allPassed) {
      console.log('✅ SUCESSO: Contrato JSON do GPN validado e QR Code real recebido com sucesso!\n');
    } else {
      console.error('❌ FALHA: A resposta do GPN violou o contrato esperado.\n');
    }
  }

  return {
    success: validation.allPassed,
    evidence,
    error: validation.allPassed ? undefined : `Contrato do GPN violado: ${JSON.stringify(validation)}`
  };
}

// Execução direta via CLI (node / tsx)
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('test-real-gpn-contract.ts') || process.argv[1].endsWith('test-real-gpn-contract.js'));

if (isDirectExecution) {
  runRealGpnContractTest()
    .then(result => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(`\n❌ Falha fatal no teste de contrato GPN: ${err.message}\n`);
      process.exit(1);
    });
}
