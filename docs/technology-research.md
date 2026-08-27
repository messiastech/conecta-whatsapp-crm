# Pesquisa e Comparação Tecnológica (2026)

## 1. Backend e Linguagem de Programação

### Comparativo de Alternativas

| Tecnologia | Produtividade | Tipagem / Robustez | Ecossistema IA & Webhooks | Execução Local Windows / Linux | Custo Operacional | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Node.js 22+ / TypeScript (Express/Fastify)** | **Altíssima** | **Estrita (TS 5.x)** | **Excelente (SDKs oficiais Meta, Google, OpenAI, Zod)** | **Imediata (zero dependências C++ complexas)** | **Baixíssimo ($0 dev, serverless/VPS low-cost)** | **ESCOLHIDA**: Padrão de mercado para Webhooks, I/O assíncrono e tipagem unificada. |
| **Python 3.11+ / FastAPI** | Alta | Boa (Pydantic / Type Hints) | Excelente (LangChain, LlamaIndex) | Média (requer venv, pip/poetry) | Baixo | Forte candidata, porém exige dual-stack TS/Python quando integrado ao frontend. |
| **NestJS (TypeScript)** | Média | Estrita | Boa | Boa | Baixo | Excessivo para MVP (muito boilerplate de decorators e injeção de dependência). |
| **Go (Golang)** | Média | Estrita | Regular (SDKs de IA menos dinâmicos) | Excelente (binário único) | Mínimo | Excelente performance bruta, mas menor velocidade de prototipação para CRM com regras mutáveis. |

**Justificativa**: Node.js com TypeScript permite compartilhar tipos (Value Objects, DTOs de IA, Schemas Zod) diretamente entre frontend e backend, além de possuir suporte de primeira classe ao parsing de buffers brutos para validação criptográfica HMAC SHA-256 de webhooks da Meta.

---

## 2. Frontend / Painel Administrativo

### Comparativo de Alternativas

| Tecnologia | Velocidade de Renderização | Facilidade de Componentização | Bundle / Startup | Curva de Aprendizado | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **React 18+ com Vite + Tailwind CSS + Lucide** | **Ultrarrápida (HMR instantâneo)** | **Altíssima (Componentes utilitários)** | **Leve (< 200KB core)** | **Baixa/Média** | **ESCOLHIDA**: Dashboard dinâmico, limpo, responsivo e sem lock-in. |
| **Next.js 15 (App Router)** | Alta | Alta | Média/Pesada | Média/Alta | Excelente para SEO/SSR público, mas adiciona complexidade desnecessária para painéis fechados de CRM. |
| **Vue 3 / Nuxt** | Alta | Alta | Leve | Baixa | Muito boa, porém menor disponibilidade de componentes e ecossistema de SDKs em relação a React. |
| **Template Engine (EJS / Pug)** | Baixa | Baixa | Mínimo | Mínimo | Inadequada para simulador interativo de WhatsApp em tempo real (Phone Mock Sandbox). |

---

## 3. Banco de Dados e Persistência

### Comparativo de Alternativas

| Tecnologia | Custo Inicial | Relacionamentos & Integridade | Concorrência / Migração | Complexidade de Setup | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Prisma ORM + SQLite (Dev) / PostgreSQL (Prod)** | **$0.00** | **Total (Foreign Keys, Constraints, Unique Indexes)** | **Alta (WAL mode no SQLite; Postgres para escala)** | **Zero (arquivo `.db` local instantâneo)** | **ESCOLHIDA**: Zero atrito no Windows, portabilidade imediata para Postgres alterando apenas `DATABASE_URL`. |
| **Supabase / PostgreSQL Cloud** | Free tier generoso | Total | Alta | Baixa/Média (requer internet e conta cloud ativa) | Excelente para produção na nuvem; mantido como alvo direto de conexão via Prisma. |
| **MongoDB / NoSQL** | Baixo | Fraca (exige validação em código) | Alta | Média | Inadequado para CRM relacional com histórico estrito de presenças, eventos e campanhas. |
| **Firebase Firestore** | Pago por leitura/escrita | Fraca | Média | Média | Vendor lock-in alto, queries relacionais limitadas para relatórios e agregações de presença. |

---

## 4. Provedores de Inteligência Artificial

### Comparativo de Modelos (Agosto 2026)

| Modelo | Latência (p50) | Custo / 1M Input Tokens | Custo / 1M Output Tokens | Suporte a JSON Schema Nativo | Qualidade em PT-BR | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini 2.0 / 2.5 Flash** | **~350ms** | **$0.10 - $0.15** | **$0.40 - $0.60** | **Sim (`responseMimeType: "application/json"`)** | **Excepcional (gírias, áudios transcritos)** | **PROVEDOR PRIMÁRIO**: Menor latência e menor custo para classificação e acolhimento. |
| **OpenAI GPT-4o-mini** | ~450ms | $0.15 | $0.60 | Sim (`strict: true`) | Excelente | **PROVEDOR SECUNDÁRIO (FALLBACK)**: Estabilidade corporativa caso Gemini esteja fora. |
| **Rule-Based Heuristic Engine** | **< 5ms** | **$0.00** | **$0.00** | **Sim (TypeScript puro)** | **Alta para casos comuns** | **FALLBACK LOCAL OFFLINE**: Garante 100% de funcionamento sem chaves de API externas. |
| **Anthropic Claude 3.5 Haiku** | ~500ms | $0.25 | $1.25 | Sim (Tool Calling) | Muito boa | Custo mais elevado para tarefas volumosas de classificação simples. |

---

## 5. Orquestração e Filas de Mensagens

| Tecnologia | Complexidade Infra | Overhead Memória | Garantia de Ordem | Throughput | Veredito |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fila Assíncrona em Memória com Token Bucket & Status DB** | **Mínima (Zero deps externas)** | **< 10MB** | **Total** | **50 a 100 msgs/s** | **ESCOLHIDA PARA MVP**: Suficiente para campanhas de 100 a 10.000 contatos sem exigir Redis local. |
| **BullMQ + Redis** | Média (requer servidor Redis) | Média (~50MB+) | Total | > 5.000 msgs/s | **ROADMAP FASE 2**: Ideal para produção multi-tenant de alto volume. |
| **RabbitMQ / Kafka** | Altíssima | Pesado | Total | > 50.000 msgs/s | Desnecessário e anti-pattern para o estágio de MVP. |

---

## 6. Estratégia de Deploy

| Plataforma | Facilidade de Deploy | Free Tier / Custo Inicial | Suporte a Webhooks & Banco | Veredito |
| :--- | :--- | :--- | :--- | :--- |
| **Railway / Render / Cloud Run** | **Git Push automatizado** | **$0 a $5/mês** | **Excelente (HTTPS nativo, variáveis de ambiente seguras)** | **RECOMENDADA**: Deploy em 1 comando com Dockerfile ou Node.js buildpack. |
| **Vercel** | Alta para Next.js | Free tier | Limitado para Webhooks de longa duração / SSE persistente | Menos adequada para SSE e jobs de fila em memória de longa execução. |
| **AWS (ECS / Fargate)** | Complexidade alta | Variável | Completo | Excessivo para validação inicial de produto. |
