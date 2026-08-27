# Estratégia de IA: Taxonomia, Structured Outputs e Human-in-the-Loop

## 1. Visão Geral

O motor de IA do **Conecta WhatsApp CRM** foi projetado para:
1. **Interpretar respostas de membros e visitantes** com alta precisão e sensibilidade pastoral/humana.
2. **Classificar o motivo da ausência** em uma taxonomia padronizada de 12 categorias.
3. **Avaliar sentimento e urgência** para priorizar contatos que demandam cuidado imediato (luto, enfermidade, crise, oração).
4. **Gerar sugestões de respostas personalizadas** prontas para envio com 1 clique (Human-in-the-loop).
5. **Garantir formato estrito e determinístico** via Structured Outputs (JSON Schema nativo).
6. **Oferecer resiliência total** através de fallback em cascata (Gemini -> OpenAI -> Heurísticas Locais por Expressões Regulares).

---

## 2. Taxonomia de Ausência (12 Categorias)

| Categoria | Descrição / Gatilhos | Exemplo de Mensagem | Nível de Urgência |
| :--- | :--- | :--- | :--- |
| `TRABALHO` | Plantão, turno, escala, hora extra, reunião de trabalho. | *"Tô no plantão do hospital hoje, não consigo sair a tempo."* | BAIXA |
| `SAUDE` | Doença pessoal, consulta médica, internamento, mal-estar. | *"Acordei com febre alta e muita dor de cabeça."* | MEDIA / ALTA |
| `FAMILIA` | Cuidado com filhos/idosos, compromisso familiar, visita de parentes. | *"Precisei ficar em casa cuidando da minha mãe que não está bem."* | MEDIA |
| `VIAGEM` | Viagem a trabalho ou lazer fora da cidade. | *"Estou viajando a trabalho em Curitiba, volto só terça."* | BAIXA |
| `COMPROMISSO` | Outra reunião, curso, faculdade, prova. | *"Tinha uma prova da faculdade hoje no mesmo horário."* | BAIXA |
| `ESQUECIMENTO` | Esqueceu a data/hora, perdeu o horário. | *"Nossa, me confundi com a data! Achei que era amanhã."* | BAIXA |
| `FALTA_INFORMACAO` | Não recebeu convite a tempo, não sabia o local/horário. | *"Não fiquei sabendo a que horas começava."* | MEDIA |
| `TRANSPORTE_LOGISTICA` | Chuva, alagamento, trânsito, carro quebrou, sem carona. | *"O pneu do meu carro furou na saída do trabalho."* | MEDIA |
| `DESINTERESSE` | Desânimo explícito, não quis ir, desmotivação. | *"Não estava com vontade de ir hoje."* | MEDIA / ALTA (Acolhimento) |
| `PEDIDO_ATENDIMENTO` | Pedido de oração, visita pastoral, luto, conversa urgente. | *"Pastor, estou passando por um momento muito difícil e preciso de oração."* | **CRÍTICA / IMEDIATA** |
| `OUTRO` | Motivo claro que não se enquadra nas categorias anteriores. | *"Faltou energia no meu bairro e precisei aguardar a equipe."* | BAIXA |
| `INCONCLUSIVO` | Mensagem monossilábica vaga, emoji isolado, texto ambíguo. | *"👍 Ok valeu"* | BAIXA |

---

## 3. Schema Estruturado (JSON Schema & Zod)

```typescript
import { z } from 'zod';

export const AbsenceAnalysisSchema = z.object({
  category: z.enum([
    'TRABALHO',
    'SAUDE',
    'FAMILIA',
    'VIAGEM',
    'COMPROMISSO',
    'ESQUECIMENTO',
    'FALTA_INFORMACAO',
    'TRANSPORTE_LOGISTICA',
    'DESINTERESSE',
    'PEDIDO_ATENDIMENTO',
    'OUTRO',
    'INCONCLUSIVO'
  ]),
  confidence: z.number().min(0.0).max(1.0),
  sentiment: z.enum(['POSITIVO', 'NEUTRO', 'NEGATIVO', 'PREOCUPADO']),
  summary: z.string().max(160),
  requires_human_attention: z.boolean(),
  urgency: z.enum(['BAIXA', 'MEDIA', 'ALTA']),
  suggested_reply: z.string().max(350)
});

export type AbsenceAnalysis = z.infer<typeof AbsenceAnalysisSchema>;
```

---

## 4. Matriz Human-in-the-Loop (HITL) em 3 Níveis

```
                      [ Mensagem Recebida no WhatsApp ]
                                      │
                                      ▼
                        [ IA Classifier & Sentiment ]
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
  [ NÍVEL 1: Baixo Risco ]     [ NÍVEL 2: Atenção Média ]    [ NÍVEL 3: Crítico/Pastoral ]
  • Confiança >= 0.85          • Confiança 0.60 a 0.84       • requires_human_attention = true
  • urgency == BAIXA           • Motivos: SAUDE leve,        • Categoria: PEDIDO_ATENDIMENTO
  • requires_attention = false   FALTA_INFO, DESINTERESSE      • urgency == ALTA ou SAUDE grave
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
│ Sugestão Pré-Aprovada     │ │ Alerta Visual no Painel   │ │ Alerta Imediato no Topo   │
│ Envio em 1 clique         │ │ Operador Revisa e Edita   │ │ Encaminhamento Pastoral   │
└───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
```

- **Nível 1 (Automação Assistida)**: Contatos com motivos rotineiros e baixa urgência recebem sugestão de resposta acolhedora pré-formatada. O operador aprova com 1 clique.
- **Nível 2 (Supervisão Ativa)**: Motivos que demandam atenção recebem destaque em amarelo no dashboard para edição e personalização antes do envio.
- **Nível 3 (Intervenção Humana Obrigatória)**: Pedidos de oração, luto ou crises graves acionam destaque visual em vermelho e bloqueiam respostas automáticas genéricas.

---

## 5. Resiliência: Motor de Fallback Heurístico Local

Caso as APIs externas de IA estejam temporariamente sem conexão ou sem chaves configuradas, o sistema aciona automaticamente o `RuleBasedFallbackProvider`:
- Executa avaliação léxica com expressões regulares refinadas para o português do Brasil.
- Garante que o painel e os testes continuem funcionando com 100% de integridade e zero latência.
