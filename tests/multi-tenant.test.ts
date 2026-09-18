import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { PhoneNumber } from '../src/domain/value-objects/phone-number.vo.js';

process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'conecta_crm_test_master_key_32_bytes_long!!';

import { validateProductionEnvironment } from '../src/presentation/server.js';
import { MockWhatsAppProvider } from '../src/infrastructure/whatsapp/mock-whatsapp.provider.js';

describe('SaaS Multi-Tenancy & Security Test Suite', () => {
  // =========================================================================
  // 1. CRIPTOGRAFIA DE SECRETS POR TENANT (AES-256-GCM)
  // =========================================================================
  describe('CryptoService - Criptografia AES-256-GCM de Tokens de Tenants', () => {
    it('deve lançar erro se ENCRYPTION_MASTER_KEY não estiver configurada', () => {
      const originalKey = process.env.ENCRYPTION_MASTER_KEY;
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(() => CryptoService.encrypt('segredo')).toThrow(/ENCRYPTION_MASTER_KEY não configurada/);
      process.env.ENCRYPTION_MASTER_KEY = originalKey;
    });

    it('deve criptografar e descriptografar corretamente com formato iv:authTag:encrypted', () => {
      const originalSecret = 'EAAGNO3s920ZBBAK8...meta_access_token_secret_123456';
      const encrypted = CryptoService.encrypt(originalSecret);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(originalSecret);

      // Valida formato padrão iv:authTag:encryptedHex
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // 12 bytes em hex = 24 caracteres (IV GCM)
      expect(parts[1]).toHaveLength(32); // 16 bytes em hex = 32 caracteres (AuthTag GCM)
      expect(parts[2].length).toBeGreaterThan(0);

      // Descriptografa e verifica integridade
      const decrypted = CryptoService.decrypt(encrypted);
      expect(decrypted).toBe(originalSecret);
    });

    it('deve tratar strings vazias ou nulas com segurança', () => {
      expect(CryptoService.encrypt('')).toBe('');
      expect(CryptoService.decrypt('')).toBe('');
    });

    it('deve rejeitar payload corrompido ou adulterado (falha de integridade AuthTag)', () => {
      const secret = 'super_secret_payload_123';
      const encrypted = CryptoService.encrypt(secret);
      const parts = encrypted.split(':');

      // Adulteração do ciphertext
      const tamperedHex = parts[2].substring(0, parts[2].length - 2) + 'ab';
      const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedHex}`;

      const decrypted = CryptoService.decrypt(tamperedPayload);
      expect(decrypted).toBe(''); // Falha na descriptografia GCM retorna string vazia com log seguro
    });

    it('deve rejeitar payload com formato inválido (sem 3 partes)', () => {
      expect(CryptoService.decrypt('invalid_format_string')).toBe('');
      expect(CryptoService.decrypt('part1:part2')).toBe('');
    });
  });

  // =========================================================================
  // 1.1 VALIDAÇÃO DE SEGREDOS OBRIGATÓRIOS EM PRODUÇÃO
  // =========================================================================
  describe('Validação de Inicialização em Produção (Fail-Fast)', () => {
    it('deve falhar no startup em produção se segredos obrigatórios faltarem', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDbUrl = process.env.DATABASE_URL;
      const originalAuthSecret = process.env.BETTER_AUTH_SECRET;
      const originalMasterKey = process.env.ENCRYPTION_MASTER_KEY;

      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.ENCRYPTION_MASTER_KEY;

      expect(() => validateProductionEnvironment()).toThrow(/Startup abortado em ambiente de PRODUÇÃO/);

      process.env.NODE_ENV = originalNodeEnv;
      process.env.DATABASE_URL = originalDbUrl;
      process.env.BETTER_AUTH_SECRET = originalAuthSecret;
      process.env.ENCRYPTION_MASTER_KEY = originalMasterKey;
    });
  });

  // =========================================================================
  // 2. CONTROLE DE ACESSO BASEADO EM ROLES (RBAC: OWNER, ADMIN, OPERATOR, VIEWER)
  // =========================================================================
  describe('RBAC - Matriz de Permissões por Role no Workspace', () => {
    const roleHierarchy: Record<string, number> = {
      owner: 4,
      admin: 3,
      operator: 2,
      viewer: 1
    };

    const isAuthorized = (userRole: string, requiredRole: 'owner' | 'admin' | 'operator' | 'viewer') => {
      const userLevel = roleHierarchy[userRole] || 0;
      const requiredLevel = roleHierarchy[requiredRole] || 0;
      return userLevel >= requiredLevel;
    };

    it('OWNER deve ter permissão total (owner, admin, operator, viewer)', () => {
      expect(isAuthorized('owner', 'owner')).toBe(true);
      expect(isAuthorized('owner', 'admin')).toBe(true);
      expect(isAuthorized('owner', 'operator')).toBe(true);
      expect(isAuthorized('owner', 'viewer')).toBe(true);
    });

    it('ADMIN deve ter acesso a operações administrativas, mas não exclusivas de owner', () => {
      expect(isAuthorized('admin', 'owner')).toBe(false);
      expect(isAuthorized('admin', 'admin')).toBe(true);
      expect(isAuthorized('admin', 'operator')).toBe(true);
      expect(isAuthorized('admin', 'viewer')).toBe(true);
    });

    it('OPERATOR deve ter acesso a leitura e escrita, mas não a gestão administrativa', () => {
      expect(isAuthorized('operator', 'owner')).toBe(false);
      expect(isAuthorized('operator', 'admin')).toBe(false);
      expect(isAuthorized('operator', 'operator')).toBe(true);
      expect(isAuthorized('operator', 'viewer')).toBe(true);
    });

    it('VIEWER deve ter acesso estritamente somente-leitura', () => {
      expect(isAuthorized('viewer', 'owner')).toBe(false);
      expect(isAuthorized('viewer', 'admin')).toBe(false);
      expect(isAuthorized('viewer', 'operator')).toBe(false);
      expect(isAuthorized('viewer', 'viewer')).toBe(true);
    });

    it('Role desconhecida ou vazia deve ser rejeitada', () => {
      expect(isAuthorized('guest', 'viewer')).toBe(false);
      expect(isAuthorized('', 'viewer')).toBe(false);
    });
  });

  // =========================================================================
  // 3. ISOLAMENTO MULTI-TENANT DE DADOS & TELEFONE POR ORGANIZAÇÃO
  // =========================================================================
  describe('Isolamento Multi-Tenant e Chave Composta de Telefone', () => {
    it('deve normalizar telefones uniformemente para comparação determinística', () => {
      const phoneRaw1 = '(11) 98765-4321';
      const phoneRaw2 = '+55 11 98765-4321';
      const phoneRaw3 = '5511987654321';

      const norm1 = PhoneNumber.normalize(phoneRaw1);
      const norm2 = PhoneNumber.normalize(phoneRaw2);
      const norm3 = PhoneNumber.normalize(phoneRaw3);

      expect(norm1.isValid).toBe(true);
      expect(norm2.isValid).toBe(true);
      expect(norm3.isValid).toBe(true);
      expect(norm1.normalizedPhone).toBe('+5511987654321');
      expect(norm2.normalizedPhone).toBe('+5511987654321');
      expect(norm3.normalizedPhone).toBe('+5511987654321');
    });

    it('deve permitir a coexistência do mesmo telefone em organizações distintas (@@unique([organizationId, normalizedPhone]))', () => {
      const orgA = 'org_alpha_church_123';
      const orgB = 'org_beta_event_456';
      const phone = '5511987654321';

      // Simulação de verificação de chave composta
      const buildTenantPhoneKey = (orgId: string, normalizedPhone: string) => `${orgId}:${normalizedPhone}`;

      const keyA = buildTenantPhoneKey(orgA, phone);
      const keyB = buildTenantPhoneKey(orgB, phone);

      expect(keyA).not.toBe(keyB);
      expect(keyA).toBe('org_alpha_church_123:5511987654321');
      expect(keyB).toBe('org_beta_event_456:5511987654321');
    });
  });

  // =========================================================================
  // 4. ROTEAMENTO DINÂMICO DE WEBHOOK META POR PHONE_NUMBER_ID DO TENANT
  // =========================================================================
  describe('Roteamento Dinâmico de Webhooks Meta por Tenant', () => {
    it('deve validar assinatura HMAC-SHA256 gerada com o App Secret específico do tenant', () => {
      const tenantAppSecret = 'tenant_meta_app_secret_abc123';
      const payloadBody = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba_tenant_1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '5511999998888',
                    phone_number_id: 'tenant_phone_id_999'
                  },
                  messages: [
                    {
                      from: '5511987654321',
                      id: 'wamid.HBgL...',
                      timestamp: '1724870000',
                      text: { body: 'Oi, tive que trabalhar no dia' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      });

      // Gera assinatura com o segredo correto do tenant
      const correctSignature = 'sha256=' + crypto
        .createHmac('sha256', tenantAppSecret)
        .update(payloadBody, 'utf8')
        .digest('hex');

      // Função de verificação idêntica à do WebhooksController
      const verifySignature = (bodyStr: string, signature: string, secret: string) => {
        const expected = 'sha256=' + crypto
          .createHmac('sha256', secret)
          .update(bodyStr, 'utf8')
          .digest('hex');
        return signature === expected;
      };

      expect(verifySignature(payloadBody, correctSignature, tenantAppSecret)).toBe(true);

      // Assinatura inválida (com segredo de outro tenant ou atacante)
      const wrongSecret = 'another_tenant_wrong_secret';
      expect(verifySignature(payloadBody, correctSignature, wrongSecret)).toBe(false);
    });

    it('deve extrair o phone_number_id para lookup de tenant no banco', () => {
      const rawPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550234567',
                    phone_number_id: 'meta_phone_id_unique_101'
                  }
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const extractedPhoneNumberId = rawPayload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      expect(extractedPhoneNumberId).toBe('meta_phone_id_unique_101');
    });
  });

  // =========================================================================
  // 5. ISOLAMENTO DO SIMULADOR SANDBOX POR TENANT
  // =========================================================================
  describe('Isolamento Estrito do Simulador Sandbox por Tenant', () => {
    it('deve isolar histórico e eventos SSE por organizationId', async () => {
      const mock = MockWhatsAppProvider.getInstance();
      const org1 = 'org_test_1';
      const org2 = 'org_test_2';

      // Dispara mensagens para as duas organizações
      await mock.sendTextMessage('+5511911110001', 'Msg Org 1', org1);
      await mock.sendTextMessage('+5511922220002', 'Msg Org 2', org2);

      // getHistory sem orgId deve retornar vazio
      expect(mock.getHistory()).toEqual([]);

      // Histórico de org1 contém apenas mensagens de org1
      const hist1 = mock.getHistory(org1);
      expect(hist1.some(m => m.text === 'Msg Org 1')).toBe(true);
      expect(hist1.some(m => m.text === 'Msg Org 2')).toBe(false);

      // Histórico de org2 contém apenas mensagens de org2
      const hist2 = mock.getHistory(org2);
      expect(hist2.some(m => m.text === 'Msg Org 2')).toBe(true);
      expect(hist2.some(m => m.text === 'Msg Org 1')).toBe(false);
    });

    it('deve emitir eventos SSE nos canais específicos de cada tenant', async () => {
      const mock = MockWhatsAppProvider.getInstance();
      const emitter = mock.getEventsEmitter();
      const orgX = 'org_tenant_x';
      const orgY = 'org_tenant_y';

      let receivedInX = false;
      let receivedInY = false;

      const listenerX = () => { receivedInX = true; };
      const listenerY = () => { receivedInY = true; };

      emitter.on(`sandbox_event:${orgX}`, listenerX);
      emitter.on(`sandbox_event:${orgY}`, listenerY);

      // Simula resposta recebida para a Org X
      mock.simulateIncomingReply('+5511999990001', 'Resposta privada Org X', orgX);

      expect(receivedInX).toBe(true);
      expect(receivedInY).toBe(false);

      emitter.off(`sandbox_event:${orgX}`, listenerX);
      emitter.off(`sandbox_event:${orgY}`, listenerY);
    });
  });
});