# 🚀 Conecta WhatsApp CRM — Relacionamento & IA (MVP)

> **Plataforma Inteligente de Gestão de Presença, Relacionamento Comunitário e Automação Pós-Evento via WhatsApp com IA e Supervisão Humana (Human-in-the-Loop).**

---

## 🌟 1. Visão Geral e Conceito Central

O **Conecta CRM** resolve o desafio de acolhimento e acompanhamento de participantes em eventos presenciais e comunidades:

$$\text{EVENTO} \longrightarrow \text{PRESENÇA} \longrightarrow \text{RELACIONAMENTO} \longrightarrow \text{WHATSAPP} \longrightarrow \text{RESPOSTA} \longrightarrow \text{IA} \longrightarrow \text{TRIAGEM} \longrightarrow \text{AÇÃO HUMANA} \longrightarrow \text{HISTÓRICO}$$

---

## 🏗️ 2. Arquitetura do Sistema e Single Source of Truth

Construído sob os padrões de **Clean Architecture**, **Ports & Adapters (Hexagonal)** e **Modular Monolith**:

```
                         ┌───────────────────────────────────────────────┐
                         │   Frontend Admin Dashboard (React 18 / Vite)  │
                         │   + Emulador Smartphone Sandbox (SSE)         │
                         └───────────────────────┬───────────────────────┘
                                                 │ HTTP / REST / SSE
                                                 ▼
                         ┌───────────────────────────────────────────────┐
                         │   Presentation Layer (Express / REST API)     │
                         │   Webhook Controller (HMAC SHA-256)           │
                         └───────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
                         ┌───────────────────────────────────────────────┐
                         │    Application Layer (Casos de Uso)           │
                         │   Import, Segment, Dispatch, AI Pipeline,     │
                         │   Follow-Up Tasks & Timeline                  │
                         └───────────┬─────────────────────┬─────────────┘
                                     │                     │
                  ┌──────────────────┴──┐               ┌──┴──────────────────┐
                  ▼                     ▼               ▼                     ▼
      ┌───────────────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌───────────────────┐
      │  WhatsApp Provider    │ │  AI Provider  │ │ Database Port     │ │ File Parser Port  │
      │  (Mock & Meta Graph)  │ │ (Gemini/Local)│ │ (Prisma / SQLite) │ │ (CSV / XLSX)      │
      └───────────────────────┘ └───────────────┘ └───────────────────┘ └───────────────────┘
```

---

## 📋 3. Módulos Funcionais Entregues

1. **Dashboard de Presença e Engajamento**: Métricas canônicas rigorosas (Taxa de Presença, Taxa Real de Resposta sobre pessoas contatadas, Alertas Pastorais, Acompanhamentos Pendentes e Matriz de Prioridade).
2. **Eventos & Presença**: Universo esperado/convidado vs presentes, importador com preview e isolamento de linhas inválidas.
3. **Campanhas Pós-Evento**: Segmentação automática entre **PRESENTES** (Agradecimento) e **AUSENTES** (Acolhimento), com tags dinâmicas (`{{nome}}`, `{{evento}}`) e bloqueio automático de Opt-Out.
4. **Central de Conversas & Triagem IA**: Classificação em 12 categorias semânticas, badges de Sentimento vs Prioridade, sugestão de resposta acolhedora com botão "Usar Sugestão" para envio humano em 1 clique.
5. **Acompanhamentos Pastorais (Follow-Up Tasks)**: Tarefas geradas automaticamente para casos de oração, saúde e luto, com fluxo de resolução.
6. **Pessoas & CRM com Linha do Tempo**: Feed cronológico unificado de relacionamento exibindo todos os eventos, mensagens, análises de IA, tarefas e consentimento LGPD.
7. **Emulador Sandbox WhatsApp**: Smartphone visual interativo conectado em tempo real via SSE para testes sem custos de API.

---

## ⚡ 4. Como Executar Localmente

### 1. Iniciar o Servidor
```bash
cd C:\Users\Messias\.gemini\antigravity\scratch\whatsapp-crm-mvp
npm run dev
```

Abra o navegador em:
- **Painel Administrativo:** `http://localhost:3000` (ou `http://localhost:5173`)
- **Health Check da API:** `http://localhost:3000/health`

### 2. Rodar a Bateria de Testes Automatizados
```bash
npm test
```

### 3. Resetar/Popular Dados de Demonstração
```bash
npm run seed
```

---

## 🔑 5. Variáveis de Ambiente (`.env`)

```ini
PORT=3000
NODE_ENV=development
DATABASE_URL="file:./dev.db"

# Provedor ("mock" para sandbox local ou "meta" para Graph API oficial)
WHATSAPP_PROVIDER=mock

# Configurações Oficiais da Meta (quando WHATSAPP_PROVIDER=meta)
META_GRAPH_API_URL="https://graph.facebook.com/v21.0"
META_PHONE_NUMBER_ID=""
META_ACCESS_TOKEN=""
META_APP_SECRET=""
META_WEBHOOK_VERIFY_TOKEN="conecta_webhook_token_secret_2026"

# Inteligência Artificial (Google Gemini)
# Se vazia, o sistema aciona automaticamente o Rule-Based Fallback local offline
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-2.0-flash"
```

---

## 🧪 6. Cenários de Testes Automatizados Validados

- ✅ **Regressão Canônica (10 pessoas)**: 4 presentes, 6 ausentes, campanha enviada, 2 respostas de saúde, 2 de trabalho, 1 ambígua, 1 opt-out, tarefas geradas e sincronização de todas as telas.
- ✅ **Normalização Telefônica E.164**: Celulares de 8 e 9 dígitos, validação de 67 DDDs brasileiros, sanitização de máscaras e rejeição de fixos.
- ✅ **Deduplicação Idempotente**: Importação múltipla da mesma pessoa sem duplicar registros.
- ✅ **Tratamento de Linhas Inválidas**: Isolamento com relatório detalhado.
- ✅ **Resiliência e Fallback Heurístico Local**: Funcionamento offline ininterrupto.
