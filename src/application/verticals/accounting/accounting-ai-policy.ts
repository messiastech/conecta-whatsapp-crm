import { AccountingCategory, ACCOUNTING_TAXONOMY } from './accounting-taxonomy.js';
import { ChurchAccountingCategory, CHURCH_ACCOUNTING_TAXONOMY } from './church-accounting-taxonomy.js';
import { getChurchKnowledgeTopic } from './church-knowledge-base.js';

export interface AccountingAIAnalysisResult {
  category: AccountingCategory | ChurchAccountingCategory;
  categoryLabel: string;
  sentiment: 'POSITIVO' | 'NEUTRO' | 'PREOCUPADO' | 'CRITICO';
  urgency: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  intent: string;
  nextAction: string;
  requiresAttention: boolean;
  requiresHumanAttention?: boolean;
  confidenceScore: number;
  reasonSummary: string;
  suggestedReply: string;
  suggestedAction: string;
  isEscalation: boolean;
  legalBasisSummary?: string;
}

export type ChurchAIAnalysisResult = AccountingAIAnalysisResult;

interface RuleDefinition<T extends string> {
  category: T;
  regex: RegExp;
  sentiment: 'POSITIVO' | 'NEUTRO' | 'PREOCUPADO' | 'CRITICO';
  urgency: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  intent: string;
  nextAction: string;
  requiresAttention: boolean;
  isEscalation: boolean;
  summary: string;
  replyTemplate: (name: string, entityName: string) => string;
}

export const CHURCH_DISCLAIMER = '\n\n[Orientação preliminar Yeshua Igrejas — sujeita à validação da assessoria contábil]';
export const GENERAL_DISCLAIMER = '\n\n[Resposta sugerida — sujeita à validação da equipe Yeshua]';

/**
 * Regras Canônicas e Especializadas do Domínio de Igrejas & Terceiro Setor
 */
const CHURCH_RULES: RuleDefinition<ChurchAccountingCategory>[] = [
  // 1. Escalonamento Mandatório por Exceção (Urgência Máxima)
  {
    category: 'CASO_COMPLEXO_FISCALIZACAO',
    regex:
      /(notifica(c|ç)(a|ã)o.*(receita|pgfn|fiscal)|intima(c|ç)(a|ã)o.*(receita|pgfn|fiscal|sefaz)|auto de infra(c|ç)(a|ã)o|multa.*(receita|pgfn|atraso|ecf|dctfweb|sped)|bloqueio.*(banc(a|á)rio|judicial|conta)|conta.*(bloqueada|travada)|mandato.*(vencido|expirado)|ata.*(vencida|expirada)|prazo.*(defesa|pericial|pgfn)|d(i|í)vida ativa.*(uni(a|ã)o|pgfn)|fiscaliza(c|ç)(a|ã)o.*receita|malha.*(fina|fiscal).*igreja)/i,
    sentiment: 'CRITICO',
    urgency: 'CRITICA',
    priority: 'URGENT',
    intent: 'CHURCH_CRITICAL_ESCALATION',
    nextAction: 'ESCALATE_TO_SENIOR_AUDITOR',
    requiresAttention: true,
    isEscalation: true,
    summary:
      'Notificação fiscal da Receita/PGFN, auto de infração, multa tributária, bloqueio de contas ou mandato eclesiástico expirado.',
    replyTemplate: (name, church) =>
      `Prezado(a) líder/pastor(a) ${name || 'da entidade'}${church ? ` (${church})` : ''}, acusamos o recebimento com prioridade MÁXIMA deste chamado referente à notificação/bloqueio fiscal. Devido aos riscos de sanção, bloqueio de contas ou prazos periciais perante a Receita Federal/PGFN, seu caso foi escalado imediatamente para a assessoria contábil e jurídica sênior da Yeshua para conferência e defesa urgente.`
  },
  // 2. Prebenda Pastoral & eSocial Categoria 701
  {
    category: 'PREBENDA_PASTORAL',
    regex:
      /(prebenda|sustento pastoral|c(o|ô)ngrua|remunera(c|ç)(a|ã)o.*pastor|ministro de confiss(a|ã)o|categoria 701|esocial.*701|fgts.*pastor|inss.*pastor|irrf.*pastor|retirada pastoral|c(o|ó)digo 701|lei 14\.?647)/i,
    sentiment: 'NEUTRO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'CHURCH_PASTORAL_ALLOWANCE',
    nextAction: 'CALCULATE_PREBENDA_WITHHOLDING',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Orientação sobre remuneração de ministro religioso (eSocial categoria 701), não-incidência de FGTS, INSS individual e IRRF progressivo.',
    replyTemplate: (name, church) =>
      `A paz, ${name || 'Pastor'}${church ? ` (${church})` : ''}! A prebenda pastoral destina-se ao sustento do ministro de confissão religiosa e possui regras tributárias específicas: é escriturada no eSocial sob a Categoria 701, com isenção absoluta de FGTS e de cota patronal previdenciária de 20% para a igreja (Lei 8.212/91, Art. 22, § 13 e Lei 14.647/2023). O pastor contribui como Contribuinte Individual e incide retenção de IRRF pela tabela progressiva mensal, recolhido na DCTFWeb.`
  },
  // 3. Voluntariado & Lei Federal 9.608/1998
  {
    category: 'VOLUNTARIADO_LEI_9608',
    regex:
      /(volunt(a|á)ri(o|a)|lei 9\.?608|termo de ades(a|ã)o|equipe de louvor|m(u|ú)sicos.*igreja|recep(c|ç)(a|ã)o.*culto|trabalhador volunt(a|á)rio|passivo trabalhista.*volunt|diaconia.*volunt)/i,
    sentiment: 'NEUTRO',
    urgency: 'MEDIA',
    priority: 'MEDIUM',
    intent: 'CHURCH_VOLUNTEER_COMPLIANCE',
    nextAction: 'PROVIDE_VOLUNTEER_AGREEMENT_TEMPLATE',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Formalização de voluntários do culto/louvor/recepção com Termo de Adesão da Lei 9.608/1998 para prevenção de passivos trabalhistas.',
    replyTemplate: (name, church) =>
      `Olá, ${name || 'Líder'}${church ? ` (${church})` : ''}! Toda atividade voluntária prestada à igreja (equipe de louvor, instrumentistas, sonoplastia, mídia, recepção e diaconia) deve ser formalizada por escrito mediante Termo de Adesão ao Serviço Voluntário, com fulcro na Lei Federal nº 9.608/1998. O termo afasta qualquer vínculo empregatício e veda ajudas de custo fixas que possam descaracterizar o voluntariado religioso.`
  },
  // 4. Imunidade Constitucional (Art. 150, VI, 'b' CF/88 e EC 116/2022)
  {
    category: 'IMUNIDADE_TRIBUTARIA',
    regex:
      /(imunidade( tribut(a|á)ria)?|artigo 150|iptu.*igreja|ipva.*igreja|itcmd.*igreja|iss.*igreja|isen(c|ç)(a|ã)o tribut(a|á)ria.*igreja|emenda constitucional 116|ec 116|aluguel.*iptu.*igreja|templo de qualquer culto)/i,
    sentiment: 'POSITIVO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'CHURCH_TAX_IMMUNITY',
    nextAction: 'GUIDE_TAX_IMMUNITY_PROTOCOL',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Imunidade constitucional de impostos para templos (Art. 150, VI, b da CF/88 e EC 116/2022 para imóveis alugados).',
    replyTemplate: (name, church) =>
      `A paz, ${name || 'irmão/pastor'}${church ? ` (${church})` : ''}! Pelo Art. 150, VI, "b" da CF/88, as igrejas gozam de imunidade de impostos (IPTU, IPVA, ITCMD, ISS, IRPJ e CSLL) vinculados às suas finalidades essenciais. Conforme a EC 116/2022, a imunidade de IPTU abrange também imóveis alugados para celebração de cultos. Para resguardar esse direito, a igreja deve cumprir o Art. 14 do CTN (não distribuir lucros e manter escrituração contábil idônea).`
  },
  // 5. Regularidade Jurídica e Cartorial (Estatuto, Ata de Posse em RCPJ e DBE)
  {
    category: 'REGULARIDADE_ESTATUTO_ATA',
    regex:
      /(estatuto( social)?|ata de (elei(c|ç)(a|ã)o|posse)|rcpj|cart(o|ó)rio de registro civil|dbe.*igreja|troca de diretoria|elei(c|ç)(a|ã)o.*diretoria|registro civil de pessoas jur(i|í)dicas)/i,
    sentiment: 'NEUTRO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'CHURCH_LEGAL_REGULARITY',
    nextAction: 'CHECK_CARTORIAL_COMPLIANCE',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Regularidade de Estatuto Social, Ata de Posse no RCPJ e sincronização no CNPJ via DBE.',
    replyTemplate: (name, church) =>
      `Olá, ${name || 'Pastor'}${church ? ` (${church})` : ''}! A governança eclesiástica exige que a Ata de Eleição e Posse da Diretoria esteja rigorosamente registrada no Cartório de Registro Civil de Pessoas Jurídicas (RCPJ) e atualizada no CNPJ da Receita Federal via DBE. Manter o mandato vigente é mandatório para evitar o bloqueio preventivo das contas bancárias e permitir a renovação do Certificado Digital da igreja.`
  },
  // 6. Certidões Negativas (CND Conjunta RFB/PGFN, CRF FGTS, CADIN)
  {
    category: 'CERTIDOES_CND',
    regex:
      /(cnd.*igreja|certid(a|ã)o negativa.*igreja|crf.*fgts.*igreja|cadin.*igreja|certid(a|ã)o conjunta.*receita|regularidade fiscal.*igreja)/i,
    sentiment: 'NEUTRO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'CHURCH_NEGATIVE_CERTIFICATES',
    nextAction: 'ISSUE_CHURCH_CND',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Emissão e monitoramento de CND Conjunta RFB/PGFN, Certificado de Regularidade do FGTS e consulta ao CADIN federal.',
    replyTemplate: (name, church) =>
      `A paz! A regularidade fiscal da igreja é comprovada pela CND Conjunta da Receita Federal/PGFN (validade de 180 dias) e pelo CRF do FGTS da Caixa Econômica (mesmo para igrejas sem empregados CLT, mediante transmissão de ausência de fato gerador no eSocial). A Yeshua realiza o monitoramento proativo para manter suas certidões sem restrições.`
  },
  // 7. Obrigações Acessórias (ECF, ECD, DCTFWeb, EFD-Reinf)
  {
    category: 'OBRIGACOES_ACESSORIAS',
    regex:
      /(obriga(c|ç)(o|õ)es acess(o|ó)rias|ecf.*igreja|ecd.*igreja|dctfweb.*igreja|efd[- ]?reinf.*igreja|r[- ]?4010.*igreja|s[- ]?1000|s[- ]?2300|declar(a|ç)(a|ã)o anual.*igreja)/i,
    sentiment: 'NEUTRO',
    urgency: 'MEDIA',
    priority: 'MEDIUM',
    intent: 'CHURCH_ACCESSORY_OBLIGATIONS',
    nextAction: 'REVIEW_ACCESSORY_OBLIGATIONS',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Declarações fiscais anuais (ECF/ECD) e mensais (DCTFWeb, EFD-Reinf, eSocial) da entidade eclesiástica.',
    replyTemplate: (name, church) =>
      `Olá! As entidades imunes e isentas estão obrigadas ao envio anual da ECF (Escrituração Contábil Fiscal) e mensal da DCTFWeb e EFD-Reinf (retenções de IRRF e prebendas), além do eSocial. O cumprimento tempestivo dessas declarações mantém o CNPJ Ativo e livre de autuações da Receita Federal.`
  },
  // 8. Segregação Patrimonial e Recibos de Dízimos/Doações
  {
    category: 'DOACOES_DIZIMOS',
    regex:
      /(d(i|í)zimo|oferta|doa(c|ç)(a|ã)o.*igreja|recibo de d(i|í)zimo|segrega(c|ç)(a|ã)o patrimonial|conta da igreja.*pastor|conta pessoal.*d(i|í)zimo|livro caixa.*igreja)/i,
    sentiment: 'NEUTRO',
    urgency: 'MEDIA',
    priority: 'MEDIUM',
    intent: 'CHURCH_FINANCIAL_SEGREGATION',
    nextAction: 'ESTABLISH_FINANCIAL_SEGREGATION',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Diretrizes de segregação patrimonial entre pastor e igreja, emissão de recibos de doações e escrituração de livro caixa.',
    replyTemplate: (name, church) =>
      `A paz! Por conformidade contábil e fiscal, todos os dízimos e ofertas devem transitar obrigatoriamente pela conta bancária e chave PIX do CNPJ da igreja, sendo terminantemente vedada a confusão com contas bancárias pessoais dos pastores. A igreja deve manter livro caixa com conciliação bancária integral e recibos formais de doações.`
  },
  // 9. Certificado Digital e-CNPJ & Procuração Eletrônica
  {
    category: 'CERTIFICADO_DIGITAL',
    regex:
      /(certificado digital.*igreja|e[- ]?cnpj.*igreja|token.*igreja|a1.*igreja|a3.*igreja|procura(c|ç)(a|ã)o eletr(o|ô)nica.*igreja)/i,
    sentiment: 'NEUTRO',
    urgency: 'MEDIA',
    priority: 'MEDIUM',
    intent: 'CHURCH_DIGITAL_CERTIFICATE',
    nextAction: 'CONFIGURE_DIGITAL_CERTIFICATE',
    requiresAttention: false,
    isEscalation: false,
    summary:
      'Emissão de e-CNPJ da igreja e procuração eletrônica no portal e-CAC da Receita Federal.',
    replyTemplate: (name, church) =>
      `Olá! O Certificado Digital e-CNPJ da igreja (padrão A1) é indispensável para as transmissões no e-CAC, eSocial e DCTFWeb. Para sua emissão, a certificadora exige a Ata de Posse registrada em cartório com mandato vigente. Com o certificado ativo, configuramos a procuração eletrônica para a Yeshua Contabilidade.`
  },
  // 10. Falar com Especialista Eclesiástico
  {
    category: 'FALAR_ESPECIALISTA',
    regex:
      /(falar com (o )?(contador|especialista|advogado) eclesi(a|á)stico|consultoria.*igreja|reuni(a|ã)o.*pastoral|atendimento humano.*igreja|abertura de congrega(c|ç)(a|ã)o|reforma estatut(a|á)ria)/i,
    sentiment: 'NEUTRO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'CHURCH_SPECIALIST_CONSULTING',
    nextAction: 'SCHEDULE_CHURCH_SPECIALIST_MEETING',
    requiresAttention: true,
    isEscalation: false,
    summary:
      'Solicitação de reunião consultiva ou atendimento humano com especialista em contabilidade e direito eclesiástico.',
    replyTemplate: (name, church) =>
      `A paz! Registramos seu pedido de reunião consultiva com nosso setor de contabilidade e direito eclesiástico${church ? ` para a ${church}` : ''}. Nossa equipe entrará em contato para agendar o melhor horário com o consultor responsável.`
  }
];

/**
 * Regras Gerais da Vertical Contábil (Yeshua Demo Geral)
 */
const ACCOUNTING_RULES: RuleDefinition<AccountingCategory>[] = [
  {
    category: 'CASO_COMPLEXO',
    regex:
      /(intima(c|ç)(a|ã)o|auto de infra(c|ç)(a|ã)o|sefaz|notifica(c|ç)(a|ã)o fiscal|malha fina|fiscaliza(c|ç)(a|ã)o|bloqueio judicial|icms[- ]?st|diverg(e|ê)ncia.*sped|defesa urgente)/i,
    sentiment: 'CRITICO',
    urgency: 'CRITICA',
    priority: 'URGENT',
    intent: 'FISCAL_DEFENSE_URGENT',
    nextAction: 'ESCALATE_TO_SENIOR_AUDITOR',
    requiresAttention: true,
    isEscalation: true,
    summary: 'Notificação de fiscalização tributária ou auto de infração com prazo pericial.',
    replyTemplate: (name, company) =>
      `Prezado(a) ${name || 'Cliente'}${company ? ` (${company})` : ''}, acusamos o recebimento do relato sobre a notificação fiscal. Devido à criticidade do prazo da SEFAZ/Receita, seu atendimento foi registrado para triagem prioritária da equipe técnica Yeshua para conferência documental.`
  },
  {
    category: 'FALAR_CONTADOR',
    regex:
      /(falar com (o )?contador|reuni(a|ã)o|agend(ar|amento)|planejamento (tribut(a|á)rio|societ(a|á)rio|patrimonial|sucess(o|ó)rio)|abertura de filial|holding|conversar pessoalmente)/i,
    sentiment: 'NEUTRO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'CONSULTING_MEETING_REQUEST',
    nextAction: 'SCHEDULE_CONTADOR_APPOINTMENT',
    requiresAttention: true,
    isEscalation: false,
    summary: 'Solicitação de reunião consultiva ou planejamento societário com o contador responsável.',
    replyTemplate: (name, company) =>
      `Olá, ${name || 'Cliente'}! Registramos seu interesse em agendamento consultivo${company ? ` para ${company}` : ''}. Nossa equipe verificará a disponibilidade da agenda do contador responsável para propor os horários disponíveis.`
  },
  {
    category: 'NOTA_FISCAL',
    regex:
      /(nfs-?e|nf-?e|nota fiscal|emiss(a|ã)o|reter|reten(c|ç)(a|ã)o|iss|csrf|pis.*cofins|cst|cfop|c(o|ó)digo de servi(c|ç)o|prefeitura.*travando|prefeitura.*rejeit)/i,
    sentiment: 'PREOCUPADO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'INVOICE_SUPPORT',
    nextAction: 'VERIFY_TAX_WITHHOLDING',
    requiresAttention: true,
    isEscalation: false,
    summary: 'Suporte urgente para emissão de nota fiscal de serviço/produto e retenções tributárias na fonte.',
    replyTemplate: (name, company) =>
      `Olá, ${name || 'Cliente'}! Recebemos sua dúvida sobre emissão de nota fiscal e retenções na fonte${company ? ` para ${company}` : ''}. Nossa equipe fiscal está conferindo o código de serviço municipal e alíquotas aplicáveis para orientar o procedimento.`
  },
  {
    category: 'IMUNIDADE_TEMPLO',
    regex:
      /(igreja|templo|imunidade|comunidade da f(e|é)|pastor|minist(e|é)rio|cnd|certid(a|ã)o negativa|ata de posse|ecf.*imun|terceiro setor)/i,
    sentiment: 'POSITIVO',
    urgency: 'ALTA',
    priority: 'HIGH',
    intent: 'RELIGIOUS_ENTITY_COMPLIANCE',
    nextAction: 'CHECK_TEMPLE_IMMUNITY',
    requiresAttention: true,
    isEscalation: false,
    summary: 'Conformidade de entidade religiosa / terceiro setor, imunidade constitucional e emissão de CNDs.',
    replyTemplate: (name, company) =>
      `A paz, ${name || 'irmão/pastor'}! A Yeshua possui núcleo dedicado a entidades religiosas e terceiro setor. Para análise da regularidade cadastral e emissão de CNDs${company ? ` da ${company}` : ''}, por favor disponibilize a ata de posse vigente para conferência da diretoria.`
  },
  {
    category: 'REFORMA_TRIBUTARIA',
    regex:
      /(reforma tribut(a|á)ria|simples nacional|ibs|cbs|transi(c|ç)(a|ã)o|al(i|í)quota|benef(i|í)cio fiscal|lucro presumido)/i,
    sentiment: 'NEUTRO',
    urgency: 'MEDIA',
    priority: 'MEDIUM',
    intent: 'TAX_REFORM_QUERY',
    nextAction: 'PROVIDE_TAX_REFORM_GUIDE',
    requiresAttention: false,
    isEscalation: false,
    summary: 'Consulta sobre impacto da Reforma Tributária (IBS/CBS) e regras do Simples Nacional.',
    replyTemplate: (name, company) =>
      `Olá, ${name || 'Cliente'}! No regime do Simples Nacional${company ? ` para ${company}` : ''}, a Reforma Tributária prevê período de transição escalonado (IBS/CBS) com manutenção dos tratamentos favorecidos. Disponibilizamos orientações técnicas gerais e podemos analisar particularidades da sua atividade.`
  },
  {
    category: 'MEI',
    regex:
      /(mei|desenquadra(r|mento)|81\.?000|limite.*faturamento|dasn|guia complementar|microempresa|migra(r|c|ç)(a|ã)o)/i,
    sentiment: 'PREOCUPADO',
    urgency: 'MEDIA',
    priority: 'MEDIUM',
    intent: 'MEI_LIMIT_EXCEEDED',
    nextAction: 'CALCULATE_MEI_TRANSITION',
    requiresAttention: false,
    isEscalation: false,
    summary: 'Excesso de limite de faturamento do MEI e necessidade de desenquadramento para Microempresa (ME).',
    replyTemplate: (name, company) =>
      `Olá, ${name || 'Cliente'}! Identificamos sua dúvida quanto ao limite de faturamento do MEI${company ? ` (${company})` : ''}. Caso o excesso ultrapasse os R$ 81 mil anuais, a equipe Yeshua analisará o percentual excedente para indicar o enquadramento adequado e as guias devidas.`
  }
];

export class AccountingAIPolicy {
  /**
   * Motor Especializado para o Domínio de Igrejas & Terceiro Setor
   * Aplica a Church Knowledge Base, taxonomia eclesiástica e o disclaimer institucional.
   */
  public static analyzeChurch(
    text: string,
    context?: { clientName?: string; churchName?: string; denomination?: string }
  ): ChurchAIAnalysisResult {
    const cleanText = text.trim();
    const name = context?.clientName || '';
    const church = context?.churchName || '';

    for (const rule of CHURCH_RULES) {
      if (rule.regex.test(cleanText)) {
        const meta = CHURCH_ACCOUNTING_TAXONOMY[rule.category];
        const kbTopic = getChurchKnowledgeTopic(rule.category);

        return {
          category: rule.category,
          categoryLabel: meta.label,
          sentiment: rule.sentiment,
          urgency: rule.urgency,
          priority: rule.priority,
          intent: rule.intent,
          nextAction: rule.nextAction,
          requiresAttention: rule.requiresAttention,
          requiresHumanAttention: rule.requiresAttention,
          confidenceScore: rule.isEscalation ? 0.98 : 0.95,
          reasonSummary: rule.summary,
          suggestedReply: rule.replyTemplate(name, church) + CHURCH_DISCLAIMER,
          suggestedAction: meta.suggestedAction,
          isEscalation: rule.isEscalation,
          legalBasisSummary: kbTopic?.legalBasis.map((l) => `${l.articleOrRule} - ${l.summary}`).join(' | ')
        };
      }
    }

    // Fallback Eclesiástico Geral
    const fallbackMeta = CHURCH_ACCOUNTING_TAXONOMY.GERAL_ECLESIASTICO;
    return {
      category: 'GERAL_ECLESIASTICO',
      categoryLabel: fallbackMeta.label,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      intent: 'GENERAL_CHURCH_INQUIRY',
      nextAction: 'REPLY_CHURCH_OPERATIONAL_CHECKLIST',
      requiresAttention: false,
      requiresHumanAttention: false,
      confidenceScore: 0.8,
      reasonSummary: 'Dúvida geral da rotina da secretaria eclesiástica ou envio de documentos.',
      suggestedReply: `A paz, ${name || 'Pastor/Líder'}! Recebemos sua mensagem na assessoria eclesiástica Yeshua. Nossa equipe registrará a solicitação${church ? ` para ${church}` : ''} e retornará com o checklist e orientações pertinentes.${CHURCH_DISCLAIMER}`,
      suggestedAction: fallbackMeta.suggestedAction,
      isEscalation: false
    };
  }

  /**
   * Classifica a mensagem sob a ótica contábil/fiscal da Yeshua atuando como deterministic safety/escalation gate.
   * Suporta contexto geral corporativo e chaveamento transparente para o domínio de igrejas.
   */
  public static analyze(
    text: string,
    context?: {
      clientName?: string;
      companyName?: string;
      churchName?: string;
      isChurch?: boolean;
      domain?: 'CHURCH' | 'ACCOUNTING';
    }
  ): AccountingAIAnalysisResult {
    const isExplicitChurch =
      context?.domain === 'CHURCH' ||
      Boolean(context?.isChurch) ||
      Boolean(context?.churchName);

    if (isExplicitChurch) {
      return this.analyzeChurch(text, {
        clientName: context?.clientName,
        churchName: context?.churchName || context?.companyName
      });
    }

    const cleanText = text.trim();
    const name = context?.clientName || '';
    const company = context?.companyName || '';

    // Avalia regras corporativas pré-existentes da Yeshua Demo
    for (const rule of ACCOUNTING_RULES) {
      if (rule.regex.test(cleanText)) {
        const meta = ACCOUNTING_TAXONOMY[rule.category];
        return {
          category: rule.category,
          categoryLabel: meta.label,
          sentiment: rule.sentiment,
          urgency: rule.urgency,
          priority: rule.priority,
          intent: rule.intent,
          nextAction: rule.nextAction,
          requiresAttention: rule.requiresAttention,
          requiresHumanAttention: rule.requiresAttention,
          confidenceScore: 0.94,
          reasonSummary: rule.summary,
          suggestedReply: rule.replyTemplate(name, company) + GENERAL_DISCLAIMER,
          suggestedAction: meta.suggestedAction,
          isEscalation: rule.isEscalation
        };
      }
    }

    // Fallback geral contábil
    const fallbackMeta = ACCOUNTING_TAXONOMY.GERAL_CONTABIL;
    return {
      category: 'GERAL_CONTABIL',
      categoryLabel: fallbackMeta.label,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      intent: 'GENERAL_ACCOUNTING_INQUIRY',
      nextAction: 'REPLY_OPERATIONAL_CHECKLIST',
      requiresAttention: false,
      requiresHumanAttention: false,
      confidenceScore: 0.75,
      reasonSummary: 'Dúvida contábil operacional ou solicitação de documentos.',
      suggestedReply: `Olá, ${name || 'Cliente'}! Recebemos sua mensagem na Yeshua Contabilidade. Nossa equipe registrará a solicitação${company ? ` para ${company}` : ''} e entrará em contato com as orientações pertinentes.${GENERAL_DISCLAIMER}`,
      suggestedAction: fallbackMeta.suggestedAction,
      isEscalation: false
    };
  }
}
