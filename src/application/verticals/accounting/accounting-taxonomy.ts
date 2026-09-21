/**
 * Taxonomia e Categorias Exclusivas da Vertical Contábil (Yeshua Contabilidade)
 * Isolado do core e de absence-taxonomy.vo.ts.
 */

export type AccountingCategory =
  | 'REFORMA_TRIBUTARIA'
  | 'MEI'
  | 'NOTA_FISCAL'
  | 'IMUNIDADE_TEMPLO'
  | 'CASO_COMPLEXO'
  | 'FALAR_CONTADOR'
  | 'GERAL_CONTABIL'
  | 'INCONCLUSIVO';

export interface AccountingCategoryMetadata {
  id: AccountingCategory;
  label: string;
  description: string;
  defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  suggestedAction: string;
  slaHours: number;
}

export const ACCOUNTING_TAXONOMY: Record<AccountingCategory, AccountingCategoryMetadata> = {
  REFORMA_TRIBUTARIA: {
    id: 'REFORMA_TRIBUTARIA',
    label: 'Reforma Tributária & Simples',
    description: 'Dúvidas sobre transição IBS/CBS, alíquotas e enquadramento do Simples Nacional.',
    defaultPriority: 'MEDIUM',
    suggestedAction: 'Orientar regras de transição e cálculo comparativo de alíquotas.',
    slaHours: 24
  },
  MEI: {
    id: 'MEI',
    label: 'MEI & Desenquadramento',
    description: 'Faturamento excedente, emissão de DAS, declaração anual DASN e migração para ME.',
    defaultPriority: 'MEDIUM',
    suggestedAction: 'Calcular percentual de excesso e orientar desenquadramento voluntário.',
    slaHours: 12
  },
  NOTA_FISCAL: {
    id: 'NOTA_FISCAL',
    label: 'Emissão de Nota Fiscal & Retenções',
    description: 'Divergência de NFS-e/NF-e, CST/CFOP, retenção de ISS/IRRF/PIS/COFINS/CSLL.',
    defaultPriority: 'HIGH',
    suggestedAction: 'Verificar código de serviço municipal e regras de retenção na fonte.',
    slaHours: 4
  },
  IMUNIDADE_TEMPLO: {
    id: 'IMUNIDADE_TEMPLO',
    label: 'Igrejas & Terceiro Setor',
    description: 'Imunidade constitucional de templos, atas, ECF, EFD-Contribuições e CND Federal.',
    defaultPriority: 'HIGH',
    suggestedAction: 'Orientar conformidade estatutária e certidões negativas de débito.',
    slaHours: 8
  },
  CASO_COMPLEXO: {
    id: 'CASO_COMPLEXO',
    label: 'Caso Complexo / Fiscalização',
    description: 'Notificação de SEFAZ/Receita Federal, malha fina, ICMS-ST ou divergência de cruzamento SPED.',
    defaultPriority: 'URGENT',
    suggestedAction: 'Escalar imediatamente para auditor fiscal / contador sênior.',
    slaHours: 2
  },
  FALAR_CONTADOR: {
    id: 'FALAR_CONTADOR',
    label: 'Falar com Contador Responsável',
    description: 'Solicitação de reunião consultiva, planejamento tributário ou atendimento humano especializado.',
    defaultPriority: 'HIGH',
    suggestedAction: 'Agendar horário com contador responsável e abrir canal direto.',
    slaHours: 4
  },
  GERAL_CONTABIL: {
    id: 'GERAL_CONTABIL',
    label: 'Dúvida Geral / Rotina',
    description: 'Folha de pagamento, pró-labore, certidões ou envio de documentos mensais.',
    defaultPriority: 'LOW',
    suggestedAction: 'Responder com instruções operacionais e checklist de documentos.',
    slaHours: 24
  },
  INCONCLUSIVO: {
    id: 'INCONCLUSIVO',
    label: 'Em Análise / Inconclusivo',
    description: 'Mensagem inicial ou sem elementos técnicos suficientes.',
    defaultPriority: 'LOW',
    suggestedAction: 'Solicitar mais detalhes ou dados da empresa para triagem.',
    slaHours: 24
  }
};
