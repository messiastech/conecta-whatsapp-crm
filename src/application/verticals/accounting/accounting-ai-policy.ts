import { AccountingCategory, ACCOUNTING_TAXONOMY } from './accounting-taxonomy.js';

export interface AccountingAIAnalysisResult {
  category: AccountingCategory;
  categoryLabel: string;
  sentiment: 'POSITIVO' | 'NEUTRO' | 'PREOCUPADO' | 'CRITICO';
  urgency: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  intent: string;
  nextAction: string;
  requiresAttention: boolean;
  confidenceScore: number;
  reasonSummary: string;
  suggestedReply: string;
  suggestedAction: string;
  isEscalation: boolean;
}

interface AccountingRule {
  category: AccountingCategory;
  regex: RegExp;
  sentiment: 'POSITIVO' | 'NEUTRO' | 'PREOCUPADO' | 'CRITICO';
  urgency: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  intent: string;
  nextAction: string;
  requiresAttention: boolean;
  isEscalation: boolean;
  summary: string;
  replyTemplate: (name: string, company: string) => string;
}

const ACCOUNTING_RULES: AccountingRule[] = [
  {
    category: 'CASO_COMPLEXO',
    regex: /(intima(c|ç)(a|ã)o|auto de infra(c|ç)(a|ã)o|sefaz|notifica(c|ç)(a|ã)o fiscal|malha fina|fiscaliza(c|ç)(a|ã)o|bloqueio judicial|icms[- ]?st|diverg(e|ê)ncia.*sped|defesa urgente)/i,
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
    regex: /(falar com (o )?contador|reuni(a|ã)o|agend(ar|amento)|planejamento (tribut(a|á)rio|societ(a|á)rio|patrimonial|sucess(o|ó)rio)|abertura de filial|holding|conversar pessoalmente)/i,
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
    regex: /(nfs-?e|nf-?e|nota fiscal|emiss(a|ã)o|reter|reten(c|ç)(a|ã)o|iss|csrf|pis.*cofins|cst|cfop|c(o|ó)digo de servi(c|ç)o|prefeitura.*travando|prefeitura.*rejeit)/i,
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
    regex: /(igreja|templo|imunidade|comunidade da f(e|é)|pastor|minist(e|é)rio|cnd|certid(a|ã)o negativa|ata de posse|ecf.*imun|terceiro setor)/i,
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
    regex: /(reforma tribut(a|á)ria|simples nacional|ibs|cbs|transi(c|ç)(a|ã)o|al(i|í)quota|benef(i|í)cio fiscal|lucro presumido)/i,
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
    regex: /(mei|desenquadra(r|mento)|81\.?000|limite.*faturamento|dasn|guia complementar|microempresa|migra(r|c|ç)(a|ã)o)/i,
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

const DISCLAIMER = '\n\n[Resposta sugerida — sujeita à validação da equipe Yeshua]';

export class AccountingAIPolicy {
  /**
   * Classifica a mensagem sob a ótica contábil/fiscal da Yeshua atuando como deterministic safety/escalation gate
   */
  public static analyze(text: string, context?: { clientName?: string; companyName?: string }): AccountingAIAnalysisResult {
    const cleanText = text.trim();
    const name = context?.clientName || '';
    const company = context?.companyName || '';

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
          confidenceScore: 0.94,
          reasonSummary: rule.summary,
          suggestedReply: rule.replyTemplate(name, company) + DISCLAIMER,
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
      confidenceScore: 0.75,
      reasonSummary: 'Dúvida contábil operacional ou solicitação de documentos.',
      suggestedReply: `Olá, ${name || 'Cliente'}! Recebemos sua mensagem na Yeshua Contabilidade. Nossa equipe registrará a solicitação${company ? ` para ${company}` : ''} e entrará em contato com as orientações pertinentes.${DISCLAIMER}`,
      suggestedAction: fallbackMeta.suggestedAction,
      isEscalation: false
    };
  }
}
