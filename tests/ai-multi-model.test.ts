import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepSeekAIProvider } from '../src/infrastructure/ai/deepseek-ai.provider.js';
import { GeminiAIProvider } from '../src/infrastructure/ai/gemini-ai.provider.js';
import { AIProviderFactory } from '../src/infrastructure/ai/ai-provider.factory.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';

describe('IA Multi-Modelo: DeepSeekAIProvider e AIProviderFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ENCRYPTION_MASTER_KEY = '01234567890123456789012345678901';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  });

  describe('DeepSeekAIProvider', () => {
    it('deve instanciar com providerName DEEPSEEK e modelo padrão deepseek-chat', () => {
      const provider = new DeepSeekAIProvider('sk-mock-key');
      expect(provider.providerName).toBe('DEEPSEEK');
      expect(provider.modelName).toBe('deepseek-chat');
    });

    it('deve lançar erro se a chave de API for vazia', () => {
      expect(() => new DeepSeekAIProvider('')).toThrow('Chave de API obrigatória');
    });

    it('deve gerar resposta contábil via DeepSeek com cálculo de tokens e custo estimado', async () => {
      const provider = new DeepSeekAIProvider('sk-mock-key');

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'Olá! Podemos ajudar com a abertura da sua igreja.',
                confidence: 0.95,
                intent: 'CHURCH_ONBOARDING',
                category: 'ABERTURA_REGULARIZACAO',
                riskLevel: 'LOW',
                decision: 'AUTO_REPLY',
                missingInformation: ['Estatuto social'],
                memoryUpdates: {
                  summary: 'Cliente deseja abrir igreja evangélica.'
                }
              })
            }
          }
        ],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 150,
          total_tokens: 650
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await provider.generateAccountingReply({
        organization: { id: 'org-1', name: 'Yeshua Contabilidade', vertical: 'ACCOUNTING' },
        person: { id: 'person-1', name: 'Pastor João', normalizedPhone: '+5511999999999' },
        memory: { summary: '', facts: {}, openItems: [], preferences: {} },
        recentMessages: [],
        inboundMessage: { id: 'msg-1', text: 'Quero abrir uma igreja', receivedAt: new Date() }
      });

      expect(result.providerUsed).toBe('DEEPSEEK');
      expect(result.reply).toBe('Olá! Podemos ajudar com a abertura da sua igreja.');
      expect(result.decision).toBe('AUTO_REPLY');
      expect(result.tokensUsed?.inputTokens).toBe(500);
      expect(result.tokensUsed?.outputTokens).toBe(150);
      expect(result.tokensUsed?.totalTokens).toBe(650);
      // Custo: (500 * 0.14 + 150 * 0.28) / 1_000_000 = (70 + 42) / 1_000_000 = 0.000112 USD
      expect(result.tokensUsed?.estimatedCostUsd).toBeCloseTo(0.000112, 6);
    });

    it('deve forçar HUMAN_ESCALATION se riskClassification.isEscalation for verdadeiro', async () => {
      const provider = new DeepSeekAIProvider('sk-mock-key');

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: 'Vou tentar responder mesmo com intimação.',
                confidence: 0.9,
                decision: 'AUTO_REPLY',
                riskLevel: 'LOW'
              })
            }
          }
        ],
        usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await provider.generateAccountingReply({
        organization: { id: 'org-1', name: 'Yeshua Contabilidade' },
        person: { id: 'person-1', name: 'Cliente', normalizedPhone: '+5511999999999' },
        memory: { summary: '', facts: {}, openItems: [], preferences: {} },
        recentMessages: [],
        inboundMessage: { id: 'msg-1', text: 'Recebi um auto de infração da Receita', receivedAt: new Date() },
        riskClassification: {
          riskLevel: 'CRITICAL',
          isEscalation: true,
          reason: 'Auto de infração fiscal detectado'
        }
      });

      expect(result.decision).toBe('HUMAN_ESCALATION');
      expect(result.riskLevel).toBe('CRITICAL');
    });

    it('deve executar summarizeMemory com sucesso', async () => {
      const provider = new DeepSeekAIProvider('sk-mock-key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Resumo atualizado da conversa.' } }]
        })
      });

      const summary = await provider.summarizeMemory('Resumo anterior', [
        { sender: 'INBOUND', text: 'Meu CNPJ é 12.345.678/0001-90' }
      ]);

      expect(summary).toBe('Resumo atualizado da conversa.');
    });

    it('deve executar healthCheck e retornar status ok', async () => {
      const provider = new DeepSeekAIProvider('sk-mock-key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      const health = await provider.healthCheck();
      expect(health.ok).toBe(true);
      expect(typeof health.latencyMs).toBe('number');
    });
  });

  describe('AIProviderFactory (AIRouter Tenant-Aware)', () => {
    it('deve retornar GEMINI por padrão para o tenant Yeshua (não ativa DeepSeek por padrão)', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: 'yeshua-org-id',
        name: 'Yeshua Contabilidade & Gestão Eclesiástica',
        slug: 'yeshua-contabilidade',
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING' }),
        settings: null
      } as any);

      const provider = await AIProviderFactory.getProviderForOrganization('yeshua-org-id');
      expect(provider.providerName).toBe('GEMINI');
    });

    it('deve instanciar DEEPSEEK quando configurado explicitamente no OrganizationSettings', async () => {
      const encryptedKey = CryptoService.encrypt('sk-tenant-deepseek-custom');

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: 'org-deepseek',
        name: 'Empresa Alpha',
        slug: 'empresa-alpha',
        metadata: null,
        settings: {
          aiProvider: 'DEEPSEEK',
          aiModel: 'deepseek-chat',
          encryptedDeepSeekKey: encryptedKey
        }
      } as any);

      const provider = await AIProviderFactory.getProviderForOrganization('org-deepseek');
      expect(provider.providerName).toBe('DEEPSEEK');
      expect(provider.modelName).toBe('deepseek-chat');
    });

    it('REGRA ESTRITA DE FALLBACK: se o provedor DEEPSEEK estiver configurado sem chave, NUNCA faz fallback silencioso para Gemini', async () => {
      delete process.env.DEEPSEEK_API_KEY;

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: 'org-deepseek-no-key',
        name: 'Empresa Beta',
        slug: 'empresa-beta',
        metadata: null,
        settings: {
          aiProvider: 'DEEPSEEK',
          aiModel: 'deepseek-chat',
          encryptedDeepSeekKey: null
        }
      } as any);

      await expect(
        AIProviderFactory.getProviderForOrganization('org-deepseek-no-key')
      ).rejects.toThrow(
        /\[AI_PROVIDER_ERROR\].*DEEPSEEK.*Fallback silencioso para outros provedores é terminantemente proibido/i
      );
    });

    it('REGRA ESTRITA DE FALLBACK: se o provedor GEMINI estiver configurado sem chave, NUNCA faz fallback silencioso para DeepSeek', async () => {
      delete process.env.GEMINI_API_KEY;

      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: 'org-gemini-no-key',
        name: 'Empresa Gama',
        slug: 'empresa-gama',
        metadata: null,
        settings: {
          aiProvider: 'GEMINI',
          aiModel: 'gemini-2.0-flash',
          encryptedGeminiKey: null
        }
      } as any);

      await expect(
        AIProviderFactory.getProviderForOrganization('org-gemini-no-key')
      ).rejects.toThrow(
        /\[AI_PROVIDER_ERROR\].*GEMINI.*Fallback silencioso para outros provedores é terminantemente proibido/i
      );
    });
  });
});
