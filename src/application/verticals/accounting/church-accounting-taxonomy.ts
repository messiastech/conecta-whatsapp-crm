/**
 * Taxonomia & Categorias Oficiais do Domínio Eclesiástico e Terceiro Setor
 * Vertical Contábil / Yeshua Contabilidade — Piloto Igrejas
 */

export type ChurchAccountingCategory =
  | 'IMUNIDADE_TRIBUTARIA'
  | 'PREBENDA_PASTORAL'
  | 'OBRIGACOES_ACESSORIAS'
  | 'REGULARIDADE_ESTATUTO_ATA'
  | 'CERTIDOES_CND'
  | 'VOLUNTARIADO_LEI_9608'
  | 'DOACOES_DIZIMOS'
  | 'CERTIFICADO_DIGITAL'
  | 'CASO_COMPLEXO_FISCALIZACAO'
  | 'FALAR_ESPECIALISTA'
  | 'GERAL_ECLESIASTICO';

export interface ChurchCategoryMetadata {
  id: ChurchAccountingCategory;
  label: string;
  description: string;
  defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  suggestedAction: string;
  slaHours: number;
  isEscalationDefault: boolean;
}

export const CHURCH_ACCOUNTING_TAXONOMY: Record<ChurchAccountingCategory, ChurchCategoryMetadata> = {
  IMUNIDADE_TRIBUTARIA: {
    id: 'IMUNIDADE_TRIBUTARIA',
    label: 'Imunidade Constitucional (Art. 150 CF/88)',
    description:
      'Imunidade de IPTU (inclusive imóveis alugados pela EC 116/2022), IPVA, ITCMD, ISS, IRPJ e CSLL vinculados às finalidades essenciais.',
    defaultPriority: 'HIGH',
    suggestedAction:
      'Orientar requisitos do Art. 14 do CTN e formalizar requerimentos administrativos municipais e estaduais com base na EC 116/2022.',
    slaHours: 8,
    isEscalationDefault: false
  },
  PREBENDA_PASTORAL: {
    id: 'PREBENDA_PASTORAL',
    label: 'Prebenda Pastoral & eSocial 701',
    description:
      'Sustento pastoral, eSocial categoria 701, isenção absoluta de FGTS, INSS contribuinte individual sem cota patronal e retenção progressiva de IRRF.',
    defaultPriority: 'HIGH',
    suggestedAction:
      'Calcular recibo mensal de prebenda com tabela progressiva de IRRF, escriturar no eSocial S-2300/S-1200 e consolidar na DCTFWeb.',
    slaHours: 6,
    isEscalationDefault: false
  },
  OBRIGACOES_ACESSORIAS: {
    id: 'OBRIGACOES_ACESSORIAS',
    label: 'Obrigações Acessórias (ECF, ECD, DCTFWeb, Reinf)',
    description:
      'Entrega anual de ECF e ECD, transmissão mensal de DCTFWeb, EFD-Reinf série R-4000 e eSocial para preservação da regularidade do CNPJ.',
    defaultPriority: 'MEDIUM',
    suggestedAction:
      'Verificar pendências de transmissão no portal e-CAC da Receita Federal e emitir guias mensais unificadas de recolhimento.',
    slaHours: 12,
    isEscalationDefault: false
  },
  REGULARIDADE_ESTATUTO_ATA: {
    id: 'REGULARIDADE_ESTATUTO_ATA',
    label: 'Estatuto Social, Ata de Posse em RCPJ & DBE',
    description:
      'Registro cartorial da diretoria no RCPJ, atualização cadastral perante o CNPJ da RFB e prevenção de bloqueio bancário por mandato expirado.',
    defaultPriority: 'HIGH',
    suggestedAction:
      'Conferir vigência do mandato diretivo, orientar lavratura da ata de eleição/posse e protocolar DBE de atualização do representante legal.',
    slaHours: 4,
    isEscalationDefault: false
  },
  CERTIDOES_CND: {
    id: 'CERTIDOES_CND',
    label: 'Certidões Negativas (CND, CRF FGTS, CADIN)',
    description:
      'Emissão e monitoramento da CND Conjunta RFB/PGFN, Certificado de Regularidade do FGTS e consulta de impedimentos no CADIN federal.',
    defaultPriority: 'HIGH',
    suggestedAction:
      'Gerar relatório de situação fiscal no e-CAC, identificar divergências impeditivas e emitir as certidões negativas atualizadas.',
    slaHours: 4,
    isEscalationDefault: false
  },
  VOLUNTARIADO_LEI_9608: {
    id: 'VOLUNTARIADO_LEI_9608',
    label: 'Termo de Voluntariado (Lei 9.608/1998)',
    description:
      'Formalização jurídica por escrito do serviço voluntário de louvor, mídia, recepção, diaconia e eventos, evitando passivo trabalhista.',
    defaultPriority: 'MEDIUM',
    suggestedAction:
      'Fornecer minuta padrão de Termo de Adesão ao Serviço Voluntário e orientar a coleta de assinaturas de todos os voluntários ministeriais.',
    slaHours: 12,
    isEscalationDefault: false
  },
  DOACOES_DIZIMOS: {
    id: 'DOACOES_DIZIMOS',
    label: 'Segregação Patrimonial & Recibos de Dízimos',
    description:
      'Vedação de confusão patrimonial entre pastor e igreja, recebimento exclusivo em contas e chaves PIX do CNPJ e escrituração de livro caixa.',
    defaultPriority: 'MEDIUM',
    suggestedAction:
      'Orientar o encerramento de recebimentos em contas físicas, estruturar modelo de recibo de doações e instituir conciliação bancária 100%.',
    slaHours: 12,
    isEscalationDefault: false
  },
  CERTIFICADO_DIGITAL: {
    id: 'CERTIFICADO_DIGITAL',
    label: 'Certificado Digital e-CNPJ & Procuração',
    description:
      'Emissão, renovação e outorga de procuração eletrônica da igreja no e-CAC para cumprimento seguro das obrigações contábeis.',
    defaultPriority: 'MEDIUM',
    suggestedAction:
      'Validar documentação cartorial com a certificadora credenciada e outorgar procuração eletrônica RFB ao CNPJ da Yeshua Contabilidade.',
    slaHours: 8,
    isEscalationDefault: false
  },
  CASO_COMPLEXO_FISCALIZACAO: {
    id: 'CASO_COMPLEXO_FISCALIZACAO',
    label: 'Notificação Fiscal / Multa / Bloqueio / Mandato Vencido',
    description:
      'Notificações fiscais da Receita Federal/PGFN, multas acessórias, bloqueio de contas bancárias por banco/Bacen ou ata de diretoria vencida.',
    defaultPriority: 'URGENT',
    suggestedAction:
      'Escalar imediatamente para auditor contábil sênior / assessoria jurídica eclesiástica da Yeshua para defesa com prazo pericial.',
    slaHours: 2,
    isEscalationDefault: true
  },
  FALAR_ESPECIALISTA: {
    id: 'FALAR_ESPECIALISTA',
    label: 'Falar com Especialista Eclesiástico',
    description:
      'Solicitação de atendimento humano especializado, reunião consultiva sobre reforma estatutária, cisão ou plantação de congregações.',
    defaultPriority: 'HIGH',
    suggestedAction:
      'Agendar reunião com o auditor/consultor eclesiástico responsável e disponibilizar canal de suporte prioritário.',
    slaHours: 4,
    isEscalationDefault: false
  },
  GERAL_ECLESIASTICO: {
    id: 'GERAL_ECLESIASTICO',
    label: 'Dúvidas Gerais / Rotina Eclesiástica',
    description:
      'Dúvidas rotineiras da secretaria, envio de documentos mensais, notas de compras e procedimentos administrativos eclesiásticos comuns.',
    defaultPriority: 'LOW',
    suggestedAction:
      'Orientar checklist operacional da secretaria eclesiástica e confirmar recebimento de documentos para arquivo.',
    slaHours: 24,
    isEscalationDefault: false
  }
};
