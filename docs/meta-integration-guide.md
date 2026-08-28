# 📘 Guia Operacional de Integração: WhatsApp Cloud API (Meta 2026)

> **Documento:** `docs/meta-integration-guide.md`  
> **Objetivo:** Instruções passo a passo para conectar o **Conecta CRM** à API oficial do WhatsApp da Meta (Modo Sandbox ou Produção) e executar o primeiro teste controlado de ponta a ponta.

---

## 🔑 1. Credenciais e Variáveis de Ambiente Necessárias

Para ativar a integração real, configure o arquivo `.env` com as seguintes variáveis:

| Variável | Obrigatória? | O que é / Onde encontrar no painel da Meta |
| :--- | :---: | :--- |
| `WHATSAPP_PROVIDER` | **SIM** | Defina como `meta` para ativar o provedor real (`WHATSAPP_PROVIDER=meta`). |
| `META_GRAPH_API_URL` | **SIM** | URL base da Graph API. Padrão: `https://graph.facebook.com/v21.0`. |
| `META_PHONE_NUMBER_ID` | **SIM** | ID do Número de Telefone. Encontrado em: *Meta Developers > Seu App > WhatsApp > API Setup > Phone number ID*. |
| `META_ACCESS_TOKEN` | **SIM** *(Secret)* | Token de Acesso da Graph API com permissões `whatsapp_business_messaging` e `whatsapp_business_management`. |
| `META_APP_SECRET` | **SIM** *(Secret)* | Chave secreta do aplicativo Meta. Encontrada em: *Meta Developers > Seu App > Configurações do App > Básico > Chave Secreta do Aplicativo (App Secret)*. Utilizada para validar a assinatura criptográfica HMAC-SHA256 dos webhooks. |
| `META_WEBHOOK_VERIFY_TOKEN` | **SIM** *(Secret)* | Token arbitrário de validação do webhook (ex: `conecta_webhook_token_secret_2026`). Deve ser idêntico no `.env` e no painel da Meta. |

---

## 🛠️ 2. Passo a Passo de Configuração no Painel Meta for Developers

### Passo 1: Criar/Acessar o Aplicativo Meta
1. Acesse o [Meta for Developers Portal](https://developers.facebook.com/apps/).
2. Crie um app do tipo **Negócios (Business)** ou selecione um existente.
3. No painel do aplicativo, adicione o produto **WhatsApp**.

### Passo 2: Cadastrar Templates de Mensagem (WhatsApp Business Manager)
No WhatsApp Manager (*Configurações do WhatsApp > Modelos de Mensagem*), crie e aprove os templates com o idioma `Português (Brasil)` (`pt_BR`):

* **Template 1 (Ausentes):**
  * **Nome do Modelo:** `pos_evento_ausente`
  * **Categoria:** Utilidade (*Utility*) ou Marketing
  * **Corpo do Texto:** `Olá, {{1}}! Graça e Paz! Sentimos sua falta no {{2}}. Esperamos que esteja tudo bem com você. Como podemos te ajudar?`
* **Template 2 (Presentes):**
  * **Nome do Modelo:** `pos_evento_presente`
  * **Categoria:** Utilidade (*Utility*) ou Marketing
  * **Corpo do Texto:** `Olá, {{1}}! Obrigado por participar do {{2}} conosco! Sua presença foi muito especial. Como foi sua experiência?`

*(Nota: Na Cloud API, variáveis dinâmicas de templates utilizam a numeração posicional `{{1}}`, `{{2}}` correspondendo a Nome e Evento).*

### Passo 3: Cadastrar Números de Destino de Teste (Modo Sandbox)
Se estiver usando o número de teste gratuito fornecido pela Meta:
1. Em *WhatsApp > API Setup*, localize a seção **"Para" (To)**.
2. Adicione o seu número pessoal de WhatsApp (com DDD) e insira o código de verificação recebido via SMS/WhatsApp para autorizá-lo como destinatário de teste.

---

## 🌐 3. Configuração do Túnel HTTPS para Webhooks Locais

A Meta exige que a URL de webhook utilize **HTTPS com certificado TLS válido**. Para testar em ambiente local no Windows, utilize uma das ferramentas gratuitas abaixo:

### Opção A: Cloudflare Tunnel (Recomendada - Rápida e Estável)
```bash
# Executar túnel temporário apontando para a porta 3000
npx cloudflared tunnel --url http://localhost:3000
```
*Copie a URL HTTPS gerada (ex: `https://exemplo-aleatorio.trycloudflare.com`).*

### Opção B: Ngrok
```bash
ngrok http 3000
```
*Copie a URL HTTPS pública gerada (ex: `https://xyz.ngrok-free.app`).*

---

## 📡 4. Configurar e Validar o Webhook no Painel da Meta

1. No painel do App Meta, vá em **WhatsApp > Configuração (Configuration)**.
2. Na seção **Webhook**, clique em **Editar (Edit)**:
   * **URL de Retorno de Chamada (Callback URL):** `https://<SUA-URL-TUNNEL>/api/webhooks/whatsapp`
   * **Token de Verificação (Verify Token):** `conecta_webhook_token_secret_2026` (o mesmo valor definido em `META_WEBHOOK_VERIFY_TOKEN` no `.env`).
3. Clique em **Verificar e Salvar (Verify and Save)**.
   * O servidor Conecta CRM responderá imediatamente com o `hub.challenge` (HTTP 200).
4. Em **Campos do Webhook (Webhook Fields)**, clique em **Gerenciar (Manage)** e assine:
   * ✅ `messages` (mensagens recebidas e status de envio)

---

## 🧪 5. Roteiro de Teste Controlado Ponta a Ponta

Execute o primeiro teste seguindo rigorosamente a ordem:

```
[1. WhatsApp Real] -> Enviar mensagem do smartphone de teste para o número Meta
        │
        ▼
[2. Webhook Inbound] -> Servidor valida HMAC-SHA256 e responde 200 OK
        │
        ▼
[3. Persistência] -> Salva Message (INBOUND) com providerMessageId (wamid) único
        │
        ▼
[4. IA Triagem] -> Categoriza motivo, sentimento, prioridade e sugere resposta
        │
        ▼
[5. Follow-Up] -> Gera tarefa pastoral se prioridade for HIGH/URGENT ou saúde/crise
        │
        ▼
[6. Dashboard/CRM] -> Atualiza contadores, exibe badge e abre Linha do Tempo
        │
        ▼
[7. Resposta Humana] -> Operador aprova/envia resposta controlada via painel (Janela 24h OK)
        │
        ▼
[8. Confirmação] -> Mensagem recebida no smartphone real + Webhook de entrega/leitura
```

### Passo a Passo de Execução:

1. **Iniciar o Servidor:**
   ```bash
   npm run dev
   ```
2. **Enviar Mensagem Real:**  
   Envie uma mensagem do seu smartphone para o número de teste da Meta (ex: *"Olá! Não pude ir no culto domingo porque estava com febre alta e fui ao hospital."*).
3. **Verificar os Logs do Servidor:**  
   Confirme o recebimento do webhook:
   ```text
   [Webhook] Mensagem recebida de +5511999999999 (wamid.HBgL...)
   [IA] Classificação: SAUDE | Sentimento: PREOCUPADO | Prioridade: HIGH
   [FollowUpTask] Tarefa de acompanhamento pastoral criada automaticamente.
   ```
4. **Verificar na Interface Web (`http://localhost:3000`):**
   - Acesse **Central de Conversas**: visualize a conversa recebida com o badge `SAUDE` e `ALTA PRIORIDADE`.
   - Acesse **Acompanhamentos**: confirme a tarefa pastoral criada com status `PENDENTE`.
   - Acesse **Pessoas & CRM > Linha do Tempo**: confira o evento cronológico da mensagem e da triagem da IA.
5. **Enviar Resposta Controlada:**
   - Na tela da conversa, clique em **"Usar Sugestão da IA"** ou digite a resposta humana e clique em **Enviar**.
   - A resposta de texto livre será despachada através da Graph API (pois a janela de 24h está ativa) e chegará imediatamente no smartphone real.
6. **Confirmar Entrega e Leitura:**
   - O WhatsApp enviará os webhooks de `delivered` e `read`, atualizando o status da mensagem no banco de dados e no painel em tempo real.

---

## 🔒 6. Segurança e Melhores Práticas

1. **Proteção de Secrets:** Nunca faça commit de `.env` com tokens reais no repositório.
2. **Tokens de Longa Duração:** Para testes contínuos, gere um *System User Access Token* permanente no Meta Business Manager com permissões `whatsapp_business_messaging`.
3. **Controle de Janela de 24h:** O backend bloqueia automaticamente o envio de texto livre caso o usuário não tenha interagido nas últimas 24 horas, protegendo contra erros e custos indevidos na Meta.
