import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIProviderFactory } from '../src/infrastructure/ai/ai-provider.factory.js';
import { MediaIngestionService } from '../src/application/services/media-ingestion.service.js';
import { MediaStorageService } from '../src/infrastructure/storage/media-storage.service.js';
import { ConversationMemoryService } from '../src/application/services/conversation-memory.service.js';
import { GpnWebhooksController } from '../src/presentation/controllers/gpn-webhooks.controller.js';
import { GeminiAIProvider } from '../src/infrastructure/ai/gemini-ai.provider.js';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { CryptoService } from '../src/infrastructure/security/crypto.service.js';
import { AttachmentType } from '@prisma/client';

describe('P0 Pré-Deploy — Validações de Segurança e Contratos Críticos', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ENCRYPTION_MASTER_KEY = '01234567890123456789012345678901';
  });

  // =========================================================================
  // 1. YESHUA BLOQUEIA DEEPSEEK
  // =========================================================================
  describe('1. Yeshua bloqueia DeepSeek', () => {
    it('deve rejeitar com erro explicito qualquer tentativa de configurar DEEPSEEK no tenant Yeshua', async () => {
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: 'org-yeshua-001',
        name: 'Yeshua Contabilidade & Gestão Eclesiástica',
        slug: 'yeshua-contabilidade',
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING' }),
        settings: {
          aiProvider: 'DEEPSEEK',
          aiModel: 'deepseek-chat',
          encryptedDeepSeekKey: CryptoService.encrypt('sk-fake-key')
        }
      } as any);

      await expect(
        AIProviderFactory.getProviderForOrganization('org-yeshua-001')
      ).rejects.toThrow(
        /\[AI_PROVIDER_ERROR\].*DEEPSEEK.*terminantemente proibido para o tenant Yeshua/i
      );
    });

    it('deve garantir que o tenant Yeshua seleciona GEMINI por padrão', async () => {
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      vi.spyOn(prisma.organization, 'findUnique').mockResolvedValue({
        id: 'org-yeshua-002',
        name: 'Yeshua Contabilidade',
        slug: 'yeshua-contabilidade',
        metadata: JSON.stringify({ verticalProfile: 'ACCOUNTING' }),
        settings: null
      } as any);

      const provider = await AIProviderFactory.getProviderForOrganization('org-yeshua-002');
      expect(provider.providerName).toBe('GEMINI');
    });
  });

  // =========================================================================
  // 2. MÍDIA SEM BYTES NÃO INVENTA CONTEÚDO
  // =========================================================================
  describe('2. Mídia sem bytes reais não inventa conteúdo', () => {
    it('deve lançar [MEDIA_CONTENT_UNAVAILABLE] quando receber URL sem bytes reais fora de teste', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(
          MediaIngestionService.ingestSingleMedia(
            {
              type: 'audio',
              mimeType: 'audio/ogg',
              url: 'https://example.com/audio.ogg' // URL não é arquivo
            },
            {
              organizationId: 'org-test',
              messageId: 'msg-test'
            }
          )
        ).rejects.toThrow(/\[MEDIA_CONTENT_UNAVAILABLE\].*URL.*não é arquivo/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('em ambiente fora de teste, GeminiAIProvider não deve gerar transcrições fictícias', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const provider = new GeminiAIProvider('fake-key');

        const result = await provider.extractMediaContent({
          type: 'AUDIO',
          mimeType: 'audio/ogg',
          fileName: 'audio.ogg'
        });

        // Não pode conter frase sintética inventada
        expect(result.extractedText).not.toContain('serviços de contabilidade e abertura de igreja');
        expect(result.extractedText).toBe('');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  // =========================================================================
  // 3. STORAGE PERSISTENTE EM PRODUÇÃO
  // =========================================================================
  describe('3. Storage filesystem dev/test only', () => {
    it('em produção sem storage persistente, deve lançar [MEDIA_STORAGE_UNAVAILABLE]', async () => {
      const origEnv = process.env.NODE_ENV;
      delete process.env.PERSISTENT_STORAGE_ENABLED;
      try {
        process.env.NODE_ENV = 'production';
        await expect(
          MediaStorageService.saveFile({
            organizationId: 'org-prod-001',
            buffer: Buffer.from('REAL_BYTES'),
            mimeType: 'image/jpeg',
            originalName: 'foto.jpg'
          })
        ).rejects.toThrow(/\[MEDIA_STORAGE_UNAVAILABLE\]/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  // =========================================================================
  // 4. ISOLAMENTO DE MEMÓRIA (ZERO CROSS-TENANT)
  // =========================================================================
  describe('4. Isolamento estrito de memória', () => {
    it('loadContext deve rejeitar com erro quando organizationId não coincidir com a memória', async () => {
      vi.spyOn(prisma.conversationMemory, 'findUnique').mockResolvedValue({
        id: 'mem-tenant-b',
        organizationId: 'tenant-b',
        personId: 'person-b',
        conversationId: 'conv-123',
        summary: 'Segredo Tenant B',
        factsJson: '{}',
        openItemsJson: '[]',
        preferencesJson: '{}',
        messageCount: 5
      } as any);

      await expect(
        ConversationMemoryService.loadContext('tenant-a', 'person-a', 'conv-123')
      ).rejects.toThrow(/\[SECURITY_CROSS_TENANT\].*outra organização/i);
    });

    it('updateAfterInbound deve rejeitar atualização quando organizationId for incompatível', async () => {
      vi.spyOn(prisma.conversationMemory, 'findUnique').mockResolvedValue({
        id: 'mem-tenant-b',
        organizationId: 'tenant-b',
        conversationId: 'conv-123'
      } as any);

      await expect(
        ConversationMemoryService.updateAfterInbound('conv-123', 'msg-1', {}, 'tenant-a')
      ).rejects.toThrow(/\[SECURITY_CROSS_TENANT\]/i);
    });
  });

  // =========================================================================
  // 5. GPN WEBHOOK INBOX DURÁVEL
  // =========================================================================
  describe('5. GPN Webhook Inbox Durável no Neon', () => {
    it('evento com status PROCESSED deve retornar no-op imediato (200 com duplicate=true)', async () => {
      const mockReq: any = {
        headers: {
          'x-gpn-event-id': 'evt_processed_001',
          'x-gpn-timestamp': String(Date.now()),
          'x-gpn-event': 'session.status',
          'x-gpn-signature': 'sha256=mock'
        },
        body: { tenantId: 'org-test' }
      };

      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      // Mock de conexão ativa
      vi.spyOn(prisma.gpnConnection, 'findFirst').mockResolvedValue({
        id: 'conn-1',
        organizationId: 'org-test',
        encryptedWebhookSecret: CryptoService.encrypt('secret-test-key-32chars-long!!!')
      } as any);

      // Assinatura válida
      vi.spyOn(GpnWebhooksController.prototype as any, 'extractPhoneFromJid').mockReturnValue('');
      const origValidate = (await import('../src/infrastructure/whatsapp/gpn-whatsapp.provider.js')).GPNWhatsAppProvider.validateGpnSignature;
      (await import('../src/infrastructure/whatsapp/gpn-whatsapp.provider.js')).GPNWhatsAppProvider.validateGpnSignature = vi.fn().mockReturnValue({ valid: true });

      // Registro existente já PROCESSED
      vi.spyOn(prisma.gpnWebhookEvent, 'findUnique').mockResolvedValue({
        id: 'evt-rec-1',
        organizationId: 'org-test',
        eventId: 'evt_processed_001',
        status: 'PROCESSED'
      } as any);

      const controller = new GpnWebhooksController({} as any);
      await controller.handle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ received: true, duplicate: true });

      (await import('../src/infrastructure/whatsapp/gpn-whatsapp.provider.js')).GPNWhatsAppProvider.validateGpnSignature = origValidate;
    });
  });
});
