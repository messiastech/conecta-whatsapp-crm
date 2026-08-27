# Escopo Funcional do MVP (Mínimo Produto Viável)

## 1. Objetivo Central do MVP

O MVP do **Conecta WhatsApp CRM** tem como meta validar de ponta a ponta o fluxo de pós-evento e relacionamento comunitário inteligente via WhatsApp, desde a ingestão da lista até a interpretação com IA e o acolhimento supervisionado.

---

## 2. Funcionalidades Entregues no MVP

### 2.1 Gestão de Eventos e Importação de Presença
- **Criação de Eventos**: Nome, data, horário e localização do evento.
- **Importador de Planilhas (CSV e XLSX)**:
  - Detecção automática de cabeçalhos (`Nome`, `Telefone`, `Evento`, `Participou`).
  - Normalização automática de telefones para padrão E.164 brasileiro.
  - Deduplicação inteligente e associação com a tabela de presença.
  - Exibição imediata dos totais de Presentes vs Ausentes.

### 2.2 Segmentação e Disparo de Campanhas
- **Segmentos Automáticos**:
  - `PRESENTES`: Participantes confirmados no evento.
  - `AUSENTES`: Convidados/cadastrados que não compareceram.
- **Editor de Templates Dinâmicos**: Suporte a interpolação de tags como `{{nome}}`, `{{evento}}` e `{{data}}`.
- **Motor de Disparo com Rate Limiting**: Fila controlada de envio de mensagens com suporte ao Mock Sandbox e à WhatsApp Cloud API oficial.

### 2.3 Recepção de Mensagens e Análise com Inteligência Artificial
- **Webhook Gateway**: Recepção de mensagens de resposta dos participantes.
- **Classificador Cognitivo de Ausência**:
  - Categorização em 12 motivos (`TRABALHO`, `SAUDE`, `FAMILIA`, `VIAGEM`, `COMPROMISSO`, `ESQUECIMENTO`, `FALTA_INFORMACAO`, `TRANSPORTE_LOGISTICA`, `DESINTERESSE`, `PEDIDO_ATENDIMENTO`, `OUTRO`, `INCONCLUSIVO`).
  - Avaliação de sentimento (`POSITIVO`, `NEUTRO`, `NEGATIVO`, `PREOCUPADO`).
  - Score de confiança e cálculo de urgência.
- **Gerador de Respostas de Acolhimento**: Redige mensagens calorosas, pastorais e contextuais prontas para envio.
- **Níveis de Human-in-the-Loop**:
  - Nível 1: Envio da sugestão com 1 clique.
  - Nível 2: Edição e aprovação pelo operador.
  - Nível 3: Alerta visual prioritário para pedidos de ajuda urgente/oração.

### 2.4 Painel Web Administrativo Completo
- **Dashboard Executivo**: Métricas de presentes, ausentes, taxa de resposta, motivos mais frequentes e alertas ativos.
- **Módulo de Pessoas**: Busca, filtros, histórico individual de presenças e conversas.
- **Módulo de Eventos & Campanhas**: Criação, importação, prévia de público e execução de disparos.
- **Central de Conversas**: Chat visual com histórico de mensagens, insights da IA e envio de respostas.
- **Emulador Visual de Celular (Sandbox Simulator)**: Tela interativa no painel para simular mensagens e respostas em tempo real sem custos de API.

---

## 3. Critérios de Sucesso do MVP
1. Importação com sucesso de planilhas com dados limpos e dados desformatados.
2. Segmentação precisa entre presentes e ausentes.
3. Disparo da campanha com geração de logs e status em tempo real.
4. Simulação ou recebimento real de mensagens pelo WhatsApp.
5. Classificação estruturada pela IA e apresentação no painel.
6. Aprovação e envio de resposta sugerida.
7. Execução 100% autônoma dos testes automatizados com sucesso.
