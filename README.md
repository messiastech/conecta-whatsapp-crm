# 🚀 Conecta WhatsApp CRM (MVP)

> **Plataforma Inteligente de Relacionamento, Gestão de Presença e Automação Pós-Evento via WhatsApp com Inteligência Artificial.**

---

## 🌟 1. Visão Geral

O **Conecta WhatsApp CRM** foi desenvolvido para resolver o desafio de acolhimento e acompanhamento de participantes de eventos comunitários e igrejas. 

Após a realização de um encontro ou culto, a plataforma permite importar a lista de participantes, segmentar automaticamente quem esteve **PRESENTE** e quem esteve **AUSENTE**, disparar mensagens personalizadas via WhatsApp oficial, interpretar as respostas recebidas através de **Inteligência Artificial (Structured JSON)**, categorizar os motivos da ausência em 12 categorias e sugerir respostas acolhedoras e pastorais prontas para envio com supervisão humana (*Human-in-the-Loop*).

---

## 🏗️ 2. Arquitetura do Sistema

Construído sob os padrões de **Clean Architecture**, **Ports & Adapters (Hexagonal)** e **Modular Monolith**:

```
                         ┌─────────────────────────────────────────┐
                         │   Frontend Admin Dashboard (React/Vite) │
                         │   + Emulador de Celular Sandbox (SSE)   │
                         └────────────────────┬────────────────────┘
                                              │ HTTP / SSE
                                              ▼
                         ┌─────────────────────────────────────────┐
                         │   Presentation Layer (Express / REST)   │
                         │   Webhook Controller (HMAC SHA-256)     │
                         └────────────────────┬────────────────────┘
                                              │
                                              ▼
                         ┌─────────────────────────────────────────┐
                         │    Application Layer (Casos de Uso)     │
                         │   Import, Segment, Dispatch, AI Pipeline│
                         └───────────┬─────────────────┬───────────┘
                                     │                 │
                  ┌──────────────────┴──┐           ┌──┴──────────────────┐
                  ▼                     ▼           ▼                     ▼
      ┌───────────────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐
      │  WhatsApp Provider    │ │  AI Provider  │ │ Database Port │ │ File Parser Port  │
      │  (Mock & Meta Graph)  │ │ (Gemini/Local)│ │ (Prisma/SQLite│ │ (CSV / XLSX Engine)│
      └───────────────────────┘ └───────────────┘ └───────────────┘ └───────────────────┘
```

### Principais Decisões Arquiteturais:
- **Portabilidade de Provedores (IWhatsAppProvider)**: Alternância instantânea entre o **Mock Sandbox Provider** (para testes locais em tempo real) e o **Meta WhatsApp Cloud API oficial** (Graph API v21+).
- **Resiliência de IA em Cascata (IAIService)**: Classificação primária via **Google Gemini 2.0/2.5 Flash** (ou OpenAI) com **Rule-Based Heuristic Fallback** local embutido (100% offline).
- **Normalização E.164**: Higienização rigorosa de telefones brasileiros, correção do 9º dígito e deduplicação de contatos.
- **Conformidade LGPD**: Gestão automática de Opt-out (`SAIR`/`STOP`) e trilha imutável de auditoria (`AuditLog`).

---

## 📋 3. Requisitos do Sistema

- **Node.js**: v18.0.0 ou superior (testado e validado no Node.js v22.12)
- **npm**: 9.0 ou superior
- **Sistema Operacional**: Windows 10/11, macOS ou Linux

---

## ⚡ 4. Instalação e Execução Rápida (Passo a Passo)

### 1. Clonar ou Acessar a Pasta do Projeto
```bash
cd C:\Users\Messias\.gemini\antigravity\scratch\whatsapp-crm-mvp
```

### 2. Instalar Dependências do Backend e Frontend
```bash
# Instala dependências do backend
npm install

# Instala dependências do frontend web
cd src/client
npm install
cd ../..
```

### 3. Configurar o Banco de Dados Local
```bash
# Cria o banco SQLite local (dev.db) com base no schema do Prisma
npx prisma db push

# (Opcional) Popula o banco com dados de demonstração realistas
npm run seed
```

### 4. Iniciar a Aplicação

Em um terminal, inicie o backend:
```bash
npm run dev
```

Em outro terminal (para rodar o painel visual com Hot Reload):
```bash
cd src/client
npm run dev
```

- **Painel Administrativo:** `http://localhost:5173` (ou `http://localhost:3000`)
- **API REST & Webhooks:** `http://localhost:3000/api`
- **Health Check:** `http://localhost:3000/health`

---

## 🔑 5. Variáveis de Ambiente (`.env`)

Copie o modelo de `.env.example` para `.env`:

```ini
# Configuração do Servidor
PORT=3000
NODE_ENV=development

# Banco de Dados
DATABASE_URL="file:./dev.db"

# Provedor de Mensagens ("mock" para sandbox local ou "meta" para oficial)
WHATSAPP_PROVIDER=mock

# Configurações Oficiais da Meta (Necessárias apenas quando WHATSAPP_PROVIDER=meta)
META_GRAPH_API_URL="https://graph.facebook.com/v21.0"
META_PHONE_NUMBER_ID="seu_phone_number_id"
META_ACCESS_TOKEN="seu_token_permanente_da_meta"
META_APP_SECRET="seu_app_secret"
META_WEBHOOK_VERIFY_TOKEN="conecta_webhook_token_secret_2026"

# Inteligência Artificial (Google Gemini)
# Se vazio, o sistema acionará automaticamente o Rule-Based Fallback local
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-2.0-flash"
```

---

## 🧪 6. Execução da Suíte de Testes Automatizados

A suíte de testes cobre integralmente os testes unitários de normalização de telefone e os **8 cenários E2E (Cenários A a H)**:

```bash
npm test
```

### Cobertura dos Cenários:
- **Cenário A**: Importação e segmentação de 100 pessoas (70 presentes, 30 ausentes).
- **Cenário B**: Deduplicação inteligente de pessoas já cadastradas.
- **Cenário C**: Rejeição e isolamento de telefones inválidos.
- **Cenário D**: Resposta com justificativa clara (Classificação precisa: Saúde, Trabalho, Viagem).
- **Cenário E**: Resposta ambígua (Classificação `INCONCLUSIVO` com confiança < 0.60).
- **Cenário F**: Pedido de contato humano/oração (`requires_human_attention = true` e urgência `ALTA`).
- **Cenário G**: Tratamento de erro na entrega retornado pelo WhatsApp.
- **Cenário H**: Resiliência e ativação do motor de fallback local quando a IA estiver offline.

---

## 📱 7. Testando com o Emulador WhatsApp Sandbox

1. Acesse a aba **"Simulador WhatsApp"** no painel administrativo (`http://localhost:5173`).
2. Digite uma mensagem de teste como participante (ex: *"Oi pastor! Tive febre alta e fui na UPA"*).
3. Veja o pipeline de IA categorizar instantaneamente como `SAUDE`, extrair o resumo e sugerir uma resposta acolhedora.
4. Acesse a aba **"Conversas & IA"** para revisar e clicar em **"Enviar Resposta"** com 1 clique.
5. Digite `"SAIR"` para validar a revogação de consentimento e bloqueio LGPD em tempo real.

---

## 📚 8. Documentação Técnica Completa

Para aprofundamento técnico e relatórios detalhados, consulte a pasta `/docs`:

- [`docs/architecture.md`](docs/architecture.md) — Diagramas, camadas e Clean Architecture.
- [`docs/technology-research.md`](docs/technology-research.md) — Pesquisa comparativa de tecnologias em 2026.
- [`docs/whatsapp-research.md`](docs/whatsapp-research.md) — Análise oficial da WhatsApp Business Platform.
- [`docs/ai-strategy.md`](docs/ai-strategy.md) — Taxonomia de ausência, prompts e Structured Outputs.
- [`docs/database-design.md`](docs/database-design.md) — Esquema ERD, índices e integridade.
- [`docs/security.md`](docs/security.md) — Threat Model, HMAC-SHA256 e LGPD.
- [`docs/mvp-scope.md`](docs/mvp-scope.md) — Escopo do MVP.
- [`docs/roadmap.md`](docs/roadmap.md) — Evolução estratégica (Fases 2 a 5).
- [`docs/decisions.md`](docs/decisions.md) — Registro de Decisões Arquiteturais (ADRs).
