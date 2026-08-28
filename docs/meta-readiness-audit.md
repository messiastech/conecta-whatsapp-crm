# 📋 Auditoria Técnica de Integração: WhatsApp Cloud API (Meta 2026)

> **Documento:** `docs/meta-readiness-audit.md`  
> **Status:** AUDITORIA & CORREÇÕES CONCLUÍDAS  
> **Classificação Final:** **`READY FOR META SANDBOX`** (100% Aprovado nos Testes de Conformidade e Resiliência)

---

## 1. Resumo Executivo

Esta auditoria técnica analisou a conformidade do código-fonte do **Conecta CRM** com as diretrizes oficiais e atualizadas da **WhatsApp Business Platform (Cloud API - Graph API v21+)** da Meta.

A arquitetura do sistema adota o padrão **Ports & Adapters (Hexagonal)**, permitindo alternar de forma transparente entre o provedor de simulação local (`MockWhatsAppProvider`) e o provedor oficial de nuvem (`MetaWhatsAppProvider`) através da variável de ambiente `WHATSAPP_PROVIDER`.

### Veredito Atualizado
Todos os gaps críticos identificados na auditoria preliminar foram **implementados e validados por testes automatizados**:
1. **Idempotência Rigorosa em Webhooks:** Retentativas de entrega de webhooks da Meta com o mesmo `providerMessageId` agora são reconhecidas de forma transparente, retornando sucesso sem duplicar mensagens, análises de IA ou tarefas de acompanhamento.
2. **Validação da Janela de Atendimento de 24 Horas:** Respostas manuais em texto livre são validadas contra o timestamp da última mensagem do contato. Tentativas fora da janela de 24h são bloqueadas com código 422 (`JANELA_24H_EXPIRADA`), orientando o operador a utilizar Templates aprovados pela Meta.

---

## 2. Arquitetura e Mapeamento do Fluxo de Dados

O fluxo ponta a ponta implementado no sistema opera da seguinte forma:

```
[1. Planilha / Presença] 
        │
        ▼
[2. Normalização E.164 & Deduplicação] ──> [Banco SQLite: Person + Attendance]
        │
        ▼
[3. Segmentação de Campanha] ──> [Filtro de Opt-Out LGPD]
        │
        ▼
[4. Provedor WhatsApp (Mock / Meta Cloud API)]
        │ (Templates / Graph API POST)
        ▼
[5. Webhook Inbound & Status Update] ──> [Validação HMAC SHA-256 (App Secret)]
        │
        ▼
[6. Pipeline de Triagem com IA] ──> [Classificação em 12 Categorias + Sentimento + Prioridade + Próxima Ação]
        │
        ▼
[7. Acompanhamento Humano (Human-in-the-Loop)]
        │ ├──> [FollowUpTask: Tarefas Pastorais / Crises]
        │ ├──> [Conversations: Sugestão de Resposta em 1-Clique com Validação 24h]
        │ └──> [RelationshipTimeline: Histórico Cronológico no CRM]
```

---

## 3. Matriz de Conformidade com a Meta WhatsApp Cloud API

| Componente / Requisito | Status | Evidência no Código | Detalhes & Conformidade Oficial |
| :--- | :---: | :--- | :--- |
| **Endpoint & Graph API v21+** | ✅ IMPLEMENTADO | `src/infrastructure/whatsapp/meta-whatsapp.provider.ts#L51` | URL canônica `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` com header `Authorization: Bearer <TOKEN>`. |
| **Envio de Templates (Business-Initiated)** | ✅ IMPLEMENTADO | `src/infrastructure/whatsapp/meta-whatsapp.provider.ts#L44-L122` | Payload estruturado com `type: 'template'`, `language: { code: 'pt_BR' }` e `components: [{ type: 'body', parameters: [...] }]`. |
| **Envio de Texto Livre (User-Initiated)** | ✅ IMPLEMENTADO | `src/infrastructure/whatsapp/meta-whatsapp.provider.ts#L124-L182` | Payload estruturado com `type: 'text'`, `text: { preview_url: false, body: ... }`. |
| **Handshake de Verificação do Webhook (GET)** | ✅ IMPLEMENTADO | `src/presentation/controllers/webhooks.controller.ts#L20-L31` | Validação de `hub.mode === 'subscribe'` e `hub.verify_token`, retornando `hub.challenge` com status HTTP 200. |
| **Validação de Assinatura HMAC-SHA256 (POST)** | ✅ IMPLEMENTADO | `src/infrastructure/whatsapp/meta-whatsapp.provider.ts#L27-L42` | Validação criptográfica com `crypto.createHmac('sha256', appSecret)` e `crypto.timingSafeEqual` sobre o buffer `rawBody`. |
| **Processamento de Inbound Messages** | ✅ IMPLEMENTADO | `src/infrastructure/whatsapp/meta-whatsapp.provider.ts#L201-L222` | Parsing robusto de mensagens do tipo `text`, `button` e `interactive` (list / button replies) com timestamps UNIX. |
| **Processamento de Status Updates** | ✅ IMPLEMENTADO | `src/presentation/controllers/webhooks.controller.ts#L68-L83` | Atualização assíncrona de status (`SENT`, `DELIVERED`, `READ`, `FAILED`) e gravação de `deliveredAt`, `readAt` e `errorMessage`. |
| **Normalização Telefônica E.164** | ✅ IMPLEMENTADO | `src/domain/value-objects/phone-number.vo.ts` | Sanitização para formato DDI + DDD + 9 dígitos (ex: `5511988887777`), rejeição de fixos e validação de 67 DDDs brasileiros. |
| **Opt-Out & Compliance LGPD** | ✅ IMPLEMENTADO | `src/application/use-cases/process-inbound-message.use-case.ts#L112-L166` | Reconhecimento de `STOP`, `SAIR`, `PARAR`, `CANCELAR`, `NÃO QUERO MAIS`, bloqueio no CRM, auditoria em `ConsentHistory` e supressão de envios. |
| **Tratamento de Idempotência em Webhooks** | ✅ IMPLEMENTADO | `src/application/use-cases/process-inbound-message.use-case.ts#L41-L107` | Verificação prévia e tratamento de erro de colisão (P2002), garantindo resposta idempotente sem duplicidade. Testado no Cenário I. |
| **Validação da Janela de 24 Horas** | ✅ IMPLEMENTADO | `src/presentation/controllers/conversations.controller.ts#L88-L108` | Bloqueio de respostas de texto livre caso a última mensagem inbound do usuário tenha mais de 24h (HTTP 422). Testado no Cenário J. |
| **Fila Assíncrona de Disparo em Massa (Queue)** | ⚠️ FUTURO (PRODUÇÃO) | `src/application/use-cases/dispatch-campaign.use-case.ts` | O envio sequencial atende até 1.000 contatos. Para escala superior a 10.000 contatos/dia, recomenda-se fila BullMQ + Redis. |
| **Suporte a Mídia / Áudio / Imagem** | ⚠️ FUTURO (PRODUÇÃO) | `src/infrastructure/whatsapp/meta-whatsapp.provider.ts` | Processamento focado em texto, botões e listas para o escopo do MVP. |

---

## 4. Análise do Frontend (Real vs Mock vs Simulador)

| Tela / Componente | Status da Integração | O que é REAL | O que é SIMULADO / MOCK |
| :--- | :---: | :--- | :--- |
| **Dashboard** | 🟢 100% REAL | Consome `/api/metrics/dashboard`, calcula KPIs canônicos reais do banco SQLite (`dev.db`). | N/A |
| **Eventos & Presença** | 🟢 100% REAL | Criação de eventos, upload de planilha real CSV/XLSX, parsing e vinculação de presença. | N/A |
| **Campanhas de Disparo** | 🟢 100% REAL | Segmentação no banco, substituição de tags e chamada ao `IWhatsAppProvider` configurado. | N/A |
| **Central de Conversas** | 🟢 100% REAL | Exibição de histórico relacional, classificação por IA e envio com validação de 24h. | N/A |
| **Acompanhamentos (Tasks)** | 🟢 100% REAL | CRUD completo conectado a `FollowUpTask` no banco, atualização de status e atribuição. | N/A |
| **Pessoas & CRM + Linha do Tempo** | 🟢 100% REAL | Listagem de contatos, edição de dados, controle de opt-out e agregação da Linha do Tempo. | N/A |
| **Simulador Sandbox (Smartphone)** | 🟡 HÍBRIDO (DEV TOOL) | Injeta mensagens no backend real via `/api/sandbox/simulate-reply` e escuta via SSE. | O dispositivo visual simula o WhatsApp para testes locais sem custo. |

---

## 5. Configuração Necessária para Ativação no Meta Sandbox

Para conectar uma conta de teste da Meta (Test Phone Number) sem custos:

### Variáveis de Ambiente Obrigatórias (`.env`):
```ini
# Ativar provedor oficial da Meta
WHATSAPP_PROVIDER=meta

# Dados obtidos no painel Meta for Developers (App > WhatsApp > API Setup)
META_GRAPH_API_URL=https://graph.facebook.com/v21.0
META_PHONE_NUMBER_ID=109876543210987
META_ACCESS_TOKEN=EAAG... (Token de Usuário do Sistema Permanente)
META_APP_SECRET=a1b2c3d4e5f6g7h8... (App Secret do aplicativo Meta)
META_WEBHOOK_VERIFY_TOKEN=conecta_webhook_token_secret_2026
```

### Checklist para Homologação no Meta Sandbox:
1. [ ] Cadastrar os números de teste no painel do Meta Developers (destinatários autorizados no modo Sandbox).
2. [ ] Criar e aprovar os templates no WhatsApp Business Manager:
   - `pos_evento_presente` (Corpo: *Olá, {{1}}! Obrigado por participar do {{2}}...*)
   - `pos_evento_ausente` (Corpo: *Olá, {{1}}! Graça e Paz! Sentimos sua falta no {{2}}...*)
3. [ ] Expor o servidor local via túnel HTTPS seguro (Cloudflare Tunnel ou Ngrok) apontando para a porta 3000.
4. [ ] Configurar a URL do Webhook no painel da Meta: `https://<seu-dominio-tunnel>/api/webhooks/whatsapp`.
5. [ ] Subscrever os campos de webhook: `messages` e `message_template_status_update`.

---

## 6. Veredito Final

### **`READY FOR META SANDBOX`**

> **Justificativa:** Todos os requisitos mandatórios para operação segura no Sandbox da Meta Cloud API foram atendidos: validação de assinatura HMAC-SHA256, handshake de verificação, idempotência estrita em reentregas de webhook, bloqueio de texto livre fora da janela de 24h, conformidade LGPD e persistência relacional.
