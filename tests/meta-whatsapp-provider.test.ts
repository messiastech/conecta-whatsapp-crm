import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { MetaWhatsAppProvider } from '../src/infrastructure/whatsapp/meta-whatsapp.provider.js';

describe('MetaWhatsAppProvider — Testes Isolados de Integração e Conformidade', () => {
  const dummyConfig = {
    apiUrl: 'https://graph.facebook.com/v21.0',
    phoneNumberId: '109876543210987',
    accessToken: 'EAAG_dummy_test_token_12345',
    appSecret: 'a1b2c3d4e5f6g7h8_secret_test',
    webhookVerifyToken: 'conecta_verify_token_2026'
  };

  let provider: MetaWhatsAppProvider;

  beforeEach(() => {
    provider = new MetaWhatsAppProvider(dummyConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Handshake de Verificação do Webhook (GET)
  // =========================================================================
  describe('Handshake de Verificação (GET /api/webhooks/whatsapp)', () => {
    it('deve retornar o challenge quando mode=subscribe e token estiver correto', () => {
      const challenge = '1158201444';
      const result = provider.verifyWebhook('subscribe', dummyConfig.webhookVerifyToken, challenge);
      expect(result).toBe(challenge);
    });

    it('deve retornar null se o token de verificação for inválido', () => {
      const challenge = '1158201444';
      const result = provider.verifyWebhook('subscribe', 'token_incorreto', challenge);
      expect(result).toBeNull();
    });

    it('deve retornar null se o mode não for "subscribe"', () => {
      const challenge = '1158201444';
      const result = provider.verifyWebhook('unsubscribe', dummyConfig.webhookVerifyToken, challenge);
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 2. Validação Criptográfica de Assinatura HMAC-SHA256 (POST)
  // =========================================================================
  describe('Validação de Assinatura Criptográfica (X-Hub-Signature-256)', () => {
    it('deve aceitar payload com assinatura HMAC-SHA256 válida gerada com o App Secret', () => {
      const rawPayload = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }), 'utf8');
      const signatureHash = crypto
        .createHmac('sha256', dummyConfig.appSecret)
        .update(rawPayload)
        .digest('hex');
      const signatureHeader = `sha256=${signatureHash}`;

      const isValid = provider.validateSignature(rawPayload, signatureHeader);
      expect(isValid).toBe(true);
    });

    it('deve rejeitar payload se o corpo da requisição foi adulterado (tampered body)', () => {
      const originalPayload = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }), 'utf8');
      const tamperedPayload = Buffer.from(JSON.stringify({ object: 'hacked_payload' }), 'utf8');

      const signatureHash = crypto
        .createHmac('sha256', dummyConfig.appSecret)
        .update(originalPayload)
        .digest('hex');
      const signatureHeader = `sha256=${signatureHash}`;

      const isValid = provider.validateSignature(tamperedPayload, signatureHeader);
      expect(isValid).toBe(false);
    });

    it('deve rejeitar se o cabeçalho de assinatura estiver ausente ou malformatado', () => {
      const rawPayload = Buffer.from(JSON.stringify({ test: true }), 'utf8');
      expect(provider.validateSignature(rawPayload, undefined)).toBe(false);
      expect(provider.validateSignature(rawPayload, 'invalid_header_format')).toBe(false);
    });
  });

  // =========================================================================
  // 3. Parsing de Payloads de Webhook Oficiais da Meta
  // =========================================================================
  describe('Parsing de Eventos do Webhook (Meta Inbound & Statuses)', () => {
    it('deve extrair corretamente mensagens de texto inbound', () => {
      const metaPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550234567',
                    phone_number_id: '109876543210987'
                  },
                  contacts: [{ profile: { name: 'Maria Silva' }, wa_id: '5511999998888' }],
                  messages: [
                    {
                      from: '5511999998888',
                      id: 'wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=',
                      timestamp: '1724851200',
                      text: { body: 'Oi, não pude ir porque estava de plantão.' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const parsed = provider.parseWebhookPayload(metaPayload);
      expect(parsed.messages.length).toBe(1);
      expect(parsed.messages[0].fromPhone).toBe('+5511999998888');
      expect(parsed.messages[0].text).toBe('Oi, não pude ir porque estava de plantão.');
      expect(parsed.messages[0].messageId).toContain('wamid.HBgL');
      expect(parsed.statuses.length).toBe(0);
    });

    it('deve extrair corretamente atualizações de status de entrega (delivered, read)', () => {
      const metaStatusPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  statuses: [
                    {
                      id: 'wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggMTIzNDU2',
                      status: 'delivered',
                      timestamp: '1724851300',
                      recipient_id: '5511999998888'
                    },
                    {
                      id: 'wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggMTIzNDU2',
                      status: 'read',
                      timestamp: '1724851400',
                      recipient_id: '5511999998888'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const parsed = provider.parseWebhookPayload(metaStatusPayload);
      expect(parsed.statuses.length).toBe(2);
      expect(parsed.statuses[0].status).toBe('delivered');
      expect(parsed.statuses[1].status).toBe('read');
      expect(parsed.statuses[0].messageId).toBe('wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggMTIzNDU2');
    });
  });

  // =========================================================================
  // 4. Envio de Templates e Mensagens (Chamadas à Graph API)
  // =========================================================================
  describe('Envio de Mensagens e Templates para Graph API', () => {
    it('deve montar o payload correto de template e processar resposta HTTP 200 de sucesso', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '5511999998888', wa_id: '5511999998888' }],
          messages: [{ id: 'wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggTUVUQV9TVEFSVDEyMw==' }]
        })
      });

      global.fetch = mockFetch;

      const result = await provider.sendTemplateMessage(
        '+55 (11) 99999-8888',
        'pos_evento_ausente',
        { nome: 'Carlos', evento: 'Culto de Domingo' }
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.messageId).toBe('wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggTUVUQV9TVEFSVDEyMw==');

      // Verifica os parâmetros da chamada HTTP para a Graph API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [callUrl, callOptions] = mockFetch.mock.calls[0];
      expect(callUrl).toBe('https://graph.facebook.com/v21.0/109876543210987/messages');
      expect(callOptions.headers['Authorization']).toBe(`Bearer ${dummyConfig.accessToken}`);

      const sentBody = JSON.parse(callOptions.body);
      expect(sentBody.to).toBe('5511999998888');
      expect(sentBody.type).toBe('template');
      expect(sentBody.template.name).toBe('pos_evento_ausente');
      expect(sentBody.template.language.code).toBe('pt_BR');
      expect(sentBody.template.components[0].parameters).toEqual([
        { type: 'text', text: 'Carlos' },
        { type: 'text', text: 'Culto de Domingo' }
      ]);
    });

    it('deve tratar resposta de erro da Graph API (ex: erro 400 - Template não aprovado)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Template name does not exist in the translated language',
            type: 'OAuthException',
            code: 132001,
            fbtrace_id: 'ABCD1234efgh'
          }
        })
      });

      global.fetch = mockFetch;

      const result = await provider.sendTemplateMessage(
        '+5511999998888',
        'template_inexistente',
        { nome: 'Carlos' }
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toContain('Template name does not exist');
    });

    it('deve montar o payload de mensagem de texto livre e enviar com sucesso', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          messages: [{ id: 'wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggVEVYVF9TVEFSVDEyMw==' }]
        })
      });

      global.fetch = mockFetch;

      const result = await provider.sendTextMessage('+5511999998888', 'Olá! Como podemos te ajudar?');

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('wamid.HBgLMjQ5OTA5ODc2NTQ1FQIAEhggVEVYVF9TVEFSVDEyMw==');

      const [, callOptions] = mockFetch.mock.calls[0];
      const sentBody = JSON.parse(callOptions.body);
      expect(sentBody.type).toBe('text');
      expect(sentBody.text.body).toBe('Olá! Como podemos te ajudar?');
      expect(sentBody.text.preview_url).toBe(false);
    });
  });
});
