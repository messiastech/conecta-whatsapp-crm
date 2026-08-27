# Roadmap de Evolução do Produto

Este documento traça o plano de evolução estratégica do **Conecta WhatsApp CRM** após a validação bem-sucedida do MVP.

---

## Fase 1 — MVP (Fase Atual)
- [x] Importação de listas de presença (CSV/XLSX) com normalização E.164 e deduplicação.
- [x] Segmentação automática (Presentes vs Ausentes).
- [x] Disparo de campanhas pós-evento com templates customizáveis.
- [x] High-Fidelity Mock Sandbox Provider com emulador de smartphone no painel.
- [x] Integração oficial com WhatsApp Business Cloud API (Graph API v21+).
- [x] Motor de IA com Structured Outputs (Gemini 2.0/2.5 Flash, OpenAI e Fallback Heurístico Local).
- [x] Classificação de 12 motivos de ausência, sentimento e sugestão de resposta.
- [x] Níveis 1 e 2 de Human-in-the-loop.
- [x] Dashboard administrativo completo com métricas e histórico.
- [x] Conformidade LGPD com Opt-out automático (`SAIR`/`STOP`) e trilha de auditoria.

---

## Fase 2 — CRM Comunitário Avançado & Engajamento Recorrente
- **Histórico Consolidado de Frequência**: Acompanhamento de frequência contínua de membros (ex: alerta de 3 ausências consecutivas).
- **Segmentação Dinâmica por Tags**: Filtros por faixa etária, ministérios, células/grupos pequenos e perfil (visitante, membro, voluntário).
- **Agendamento de Campanhas**: Programação prévia de disparos (ex: lembrete 24h antes do evento).
- **Filas de Alta Escala com BullMQ + Redis**: Para disparos simultâneos para dezenas de milhares de contatos.

---

## Fase 3 — Agente de IA Autônomo & Atendimento Inteligente (Nível 3)
- **Piloto Automático Seguro**: Respostas automáticas para dúvidas frequentes de evento (endereço, horário, estacionamento, espaço infantil).
- **Áudios do WhatsApp**: Transcrição de áudios recebidos via Whisper / Gemini Multimodal para classificação de motivos gravados por voz.
- **Detecção de Sentimento Longitudinal**: Alertas de esfriamento espiritual ou desânimo antes do abandono do grupo.
- **Roteamento Pastoral Inteligente**: Notificações instantâneas no WhatsApp pessoal do líder responsável quando um membro pedir oração ou visita.

---

## Fase 4 — Multi-Tenant, Multi-Igrejas & SaaS
- **Arquitetura Multi-Tenant**: Isolamento de dados por congregação/unidade/igreja.
- **Controle de Acesso Baseado em Papéis (RBAC)**: Pastores, Líderes de Célula, Secretários e Voluntários com visibilidade restrita ao seu escopo.
- **Múltiplos Números de WhatsApp**: Suporte a diferentes números de WhatsApp conectados a diferentes departamentos.

---

## Fase 5 — Analytics Preditivo & Inteligência Comunitária
- **Score de Engajamento e Retenção Comunitária**: Algoritmo preditivo para estimar probabilidade de retorno de visitantes.
- **Relatórios Executivos Exportáveis**: Geração de relatórios em PDF com gráficos consolidados para reuniões de liderança.
- **Integração com Sistemas Eclesiásticos e CRMs Existentes**: APIs abertas e webhooks para integração com Prover, E-inscrição, ChurchTools e outros.
