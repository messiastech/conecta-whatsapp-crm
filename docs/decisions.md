# Registro de Decisões Arquiteturais (ADRs)

Este documento registra as decisões técnicas fundamentais adotadas no projeto, suas justificativas, alternativas analisadas e impactos.

---

## ADR 001: Arquitetura em Monólito Modular com TypeScript

- **Status**: Aprovado
- **Contexto**: O MVP precisa ser entregue com alta velocidade, tipagem estrita de ponta a ponta e baixíssimo atrito de execução local no Windows/Linux/Mac, mantendo flexibilidade para o futuro.
- **Alternativas**:
  1. *Microsserviços*: Descartado por adicionar sobrecarga de deploy, rede e complexidade operacional prematura.
  2. *Next.js Fullstack*: Descartado para o backend principal para garantir isolamento limpo de handlers de Webhook brutos com validação criptográfica HMAC e streaming SSE desacoplado.
  3. *Monólito Modular TypeScript (Node.js/Express + React/Vite)*: Escolhido.
- **Consequências**: Permite compartilhar contratos de dados (Value Objects, DTOs Zod) diretamente, mantendo uma clara separação em 4 camadas (Domain, Application, Infrastructure, Presentation).

---

## ADR 002: Abstração de Provedor de Mensagens com Padrão Adapter (Ports & Adapters)

- **Status**: Aprovado
- **Contexto**: A integração real com a WhatsApp Cloud API da Meta depende de conta verificada, números homologados e templates pré-aprovados. Durante o desenvolvimento e testes automatizados, é crucial poder rodar 100% dos fluxos sem dependência externa ou custos.
- **Decisão**: Criar a porta `IWhatsAppProvider` com duas implementações concretas:
  1. `MetaWhatsAppCloudApiProvider`: Comunicação oficial com a Graph API v21+ da Meta.
  2. `MockWhatsAppProvider`: Simulador local em tempo real conectado via Server-Sent Events (SSE) ao emulador visual de smartphone no dashboard.
- **Consequências**: O sistema roda perfeitamente em modo `sandbox/mock` para demonstrações e testes, e passa para o modo de produção oficial apenas alterando variáveis de ambiente.

---

## ADR 003: Estratégia de IA em Cascata (Structured Outputs + Fallback Heurístico Local)

- **Status**: Aprovado
- **Contexto**: A interpretação das mensagens recebidas exige categorização determinística e geração de respostas pastorais empáticas. Não podemos permitir que o sistema pare caso a chave de API externa não esteja configurada ou o provedor apresente instabilidade de rede.
- **Decisão**: Implementar o padrão *Chain of Responsibility*:
  1. Provedor Primário: Google Gemini 2.0/2.5 Flash via Structured Outputs (`responseMimeType: application/json`).
  2. Provedor Secundário: OpenAI GPT-4o-mini com JSON schema estrito.
  3. Provedor de Contingência Local: `RuleBasedFallbackProvider` baseado em Regex e dicionário léxico (zero rede, zero custo, zero latência).
- **Consequências**: Taxa de disponibilidade de 100% para o classificador e formato JSON garantido em tempo de execução.

---

## ADR 004: Persistência com Prisma ORM (SQLite em Dev / PostgreSQL em Prod)

- **Status**: Aprovado
- **Contexto**: Facilitar a execução local sem exigir instalação prévia de Docker ou serviços pesados no Windows do usuário, mantendo integridade referencial total.
- **Decisão**: Utilizar Prisma ORM com driver SQLite local (`dev.db`), estruturando o schema com tipos e restrições compatíveis com migração direta para PostgreSQL em produção.
- **Consequências**: Setup local instantâneo com `npx prisma db push`.

---

## ADR 005: Normalização Telefônica E.164 com Chave Natural de Negócio

- **Status**: Aprovado
- **Contexto**: Importações de listas trazem telefones com formatos variados (com/sem DDI, com/sem 9º dígito, caracteres de máscara).
- **Decisão**: Criar o Value Object `PhoneNumber` que valida DDDs brasileiros oficiais, adiciona o 9º dígito quando aplicável e normaliza para `+55DD9XXXXXXXX`. O campo `normalized_phone` atua como chave única de unicidade no banco.
- **Consequências**: Eliminação de contatos duplicados por inconsistência de formatação de telefone.
