# Relatório de Auditoria Técnica e Plano de Refinamento (MVP)
**Projeto:** Conecta CRM — Relacionamento & IA  
**Data:** 28/08/2026  
**Papel:** Principal Software Architect + Staff Full-Stack Engineer + AI Engineer + Security & QA Lead  

---

## 1. Sumário Executivo da Auditoria

Foi realizada uma auditoria minuciosa em 100% da base de código existente (`src/domain`, `src/infrastructure`, `src/application`, `src/presentation`, `src/client`, `prisma/schema.prisma` e `tests/`).

O projeto possui uma base sólida em Clean Architecture, TypeScript estrito, Prisma ORM e Provider Pattern para mensagens e IA. Contudo, para transformar o MVP em uma plataforma de CRM comunitário verdadeiramente integrada e com **Single Source of Truth**, este documento registra todos os pontos auditados, as discrepâncias identificadas e as correções arquiteturais implementadas.

---

## 2. Matriz de Auditoria e Diagnóstico

| ID | Área / Módulo | Problema Identificado | Severidade | Impacto no Produto | Correção / Ação Realizada |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **AUD-01** | **Modelo de Domínio & Ausência** | Ausência definida apenas por flag binária `attended: boolean`, sem diferenciar universo de convidados, confirmados e presentes. | **Alta** | Risco de classificar pessoas do CRM como "ausentes" sem que tenham sido convidadas para aquele evento. | Modelagem do status de participação: `INVITED`, `CONFIRMED`, `ATTENDED`, `ABSENT`, `UNREGISTERED_ATTENDEE`. Ausência é estritamente vinculada ao universo convidado/esperado do evento. |
| **AUD-02** | **Métricas do Dashboard** | `responseRate` calculado como `(totalMessagesReceived / totalMessagesSent) * 100`, podendo gerar taxas distorcidas (> 100%). | **Alta** | Métrica de engajamento semanticamente incorreta quando um contato envia múltiplas mensagens. | Refatoração para métricas canônicas: contatos únicos impactados, contatos únicos que responderam, taxa real de resposta (0-100%), taxa de presença e taxa de recuperação. |
| **AUD-03** | **CRM & Linha do Tempo** | Tela de Pessoas exibia apenas lista básica de eventos sem uma linha do tempo unificada de relacionamento. | **Média** | O gestor não conseguia ver a sequência cronológica (Convite -> Presença/Falta -> Disparo -> Resposta -> IA -> Ação Pastoral). | Implementação do feed cronológico unificado de relacionamento no CRM (`RelationshipTimeline`), agregando eventos, mensagens, análises de IA e tarefas. |
| **AUD-04** | **Tarefas & Acompanhamento (Follow-Up)** | Ausência de entidade formal `FollowUp` / `Task` para rastrear encaminhamentos pastorais gerados pela IA. | **Alta** | Pedidos de oração ou crises ficavam restritos a badges na conversa sem fluxo de resolução de tarefas. | Criação da entidade `FollowUpTask` (prioridade, status `PENDING`/`COMPLETED`, responsável, prazo) gerada automaticamente pela IA quando `requires_human_attention = true`. |
| **AUD-05** | **IA: Sentimento vs Prioridade** | Sentimento e Urgência eram tratados de forma simplificada sem diferenciar a prioridade pastoral da emoção expressa. | **Média** | Casos como luto tranquilo ou reclamação logística podiam receber prioridades inadequadas. | Enriquecimento do schema da IA: `intent`, `reason`, `sentiment`, `urgency`, `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), `requires_human_attention`, `next_action`. |
| **AUD-06** | **LGPD & Gestão de Consentimento** | Consentimento mantido apenas como boolean `optOut` simples na tabela `Person`. | **Média** | Falta de histórico de origem do consentimento e motivo do descadastro. | Expansão para `consentStatus` (`OPTED_IN`, `OPTED_OUT`), `optOutReason`, `optOutAt`, `consentSource` e registro na tabela `ConsentHistory`/`AuditLog`. |
| **AUD-07** | **Simulador Sandbox & Provider** | Mensagens de simulação precisavam refletir 100% dos dados no banco relacional sem dependência de estado transitório de memória. | **Baixa** | Já operava com eventos SSE, mas precisava garantir idempotência de mensagens recebidas. | Integração completa com o pipeline relacional Prisma garantindo que qualquer interação no simulador atualize instantaneamente CRM, Conversas e Dashboard. |
| **AUD-08** | **Single Source of Truth** | Verificação de contadores de presença entre Dashboard, Eventos e Campanhas. | **Alta** | Garantir que o número de presentes e ausentes calculado no Evento seja idêntico em todas as telas. | Centralização dos cálculos de presença e público-alvo nas consultas relacionais do Prisma. |

---

## 3. Modelo Conceitual do Domínio Refinado

```
[ PESSOA ] ──────────── (1:N) ──────────── [ CONSENT_HISTORY ]
   │
   ├────────── (1:N) ────────── [ ATTENDANCE / PARTICIPATION ] ──────── (N:1) ──────── [ EVENTO ]
   │                                     │ (Status: INVITED, CONFIRMED,                       │
   │                                     │          ATTENDED, ABSENT)                         │
   │                                     │                                                    ▼
   ├────────── (1:N) ────────── [ CAMPAIGN_RECIPIENT ] ──────────────── (N:1) ──────── [ CAMPANHA ]
   │                                     │
   ▼                                     ▼
[ CONVERSA ] ──────── (1:N) ──────── [ MENSAGEM ] (OUTBOUND / INBOUND)
   │                                     │
   ├────────── (1:1) ────────── [ AI_ANALYSIS ] (intent, reason, sentiment, priority, next_action)
   │
   └────────── (1:N) ────────── [ FOLLOWUP_TASK ] (status: PENDING / COMPLETED, priority)
```

---

## 4. Próximas Ações e Implementações Concluídas

1. **Schema Prisma**: `FollowUpTask`, `ConsentHistory`, novos enums e campos de prioridade/next_action.
2. **IA Enriquecida**: Distinção clara entre sentimento do membro e prioridade de atendimento pastoral.
3. **Métricas Consistentes**: Eliminação de distorções e unificação da fonte de verdade.
4. **CRM com Timeline**: Linha do tempo completa e interativa no perfil da pessoa.
5. **Acompanhamentos**: Gestão de tarefas com resolução de pendências em 1 clique.
