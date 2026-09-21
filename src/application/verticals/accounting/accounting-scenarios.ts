/**
 * Cenários Pré-Configurados do Sandbox para a Vertical Contábil (Yeshua Contabilidade)
 */

export interface AccountingScenario {
  id: string;
  title: string;
  text: string;
  badge: string;
  badgeColor?: string;
  clientName: string;
  clientPhone: string;
  companyName: string;
  expectedCategory: string;
  expectedPriority: string;
}

export const ACCOUNTING_SCENARIOS: AccountingScenario[] = [
  {
    id: 'simples_reforma',
    title: 'Simples / Reforma Tributária',
    text: 'Olá equipe Yeshua! Nossa empresa de tecnologia é optante pelo Simples Nacional. Como fica nossa tributação com a transição do IBS/CBS da Reforma Tributária? Vamos perder benefícios fiscais?',
    badge: 'REFORMA_TRIBUTARIA',
    badgeColor: 'bg-indigo-100 text-indigo-800',
    clientName: 'Roberto Silveira (TechSolutions LTDA)',
    clientPhone: '+5511981112233',
    companyName: 'TechSolutions Serviços de TI',
    expectedCategory: 'REFORMA_TRIBUTARIA',
    expectedPriority: 'MEDIUM'
  },
  {
    id: 'mei_desenquadramento',
    title: 'MEI / Limite de Faturamento',
    text: 'Boa tarde! Fiz as contas do meu faturamento deste ano e ultrapassei os R$ 81.000,00 do MEI, fechando em R$ 98.000,00. Preciso desenquadrar agora para Microempresa? Como calcular a guia complementar?',
    badge: 'MEI',
    badgeColor: 'bg-amber-100 text-amber-800',
    clientName: 'Carla Dias (CD Consultoria MEI)',
    clientPhone: '+5511982223344',
    companyName: 'CD Consultoria',
    expectedCategory: 'MEI',
    expectedPriority: 'MEDIUM'
  },
  {
    id: 'nota_fiscal_retencoes',
    title: 'Nota Fiscal / Retenção de Tributos',
    text: 'Preciso emitir urgentemente uma NFS-e de R$ 45.000,00 para um cliente corporativo de outro município com retenção de ISS e CSRF (PIS/COFINS/CSLL), mas o sistema da Prefeitura está travando no código de serviço.',
    badge: 'NOTA_FISCAL',
    badgeColor: 'bg-rose-100 text-rose-800',
    clientName: 'Marcos Vinicius (LogExpress Transportes)',
    clientPhone: '+5511983334455',
    companyName: 'LogExpress Transportes & Logística',
    expectedCategory: 'NOTA_FISCAL',
    expectedPriority: 'HIGH'
  },
  {
    id: 'igreja_imunidade',
    title: 'Igreja / Imunidade & CND',
    text: 'A paz de Cristo! Nossa Comunidade da Fé precisa renovar a Certidão Negativa de Débitos (CND) na Receita Federal e protocolar a declaração de imunidade constitucional de templos. Quais documentos vocês precisam?',
    badge: 'IMUNIDADE_TEMPLO',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    clientName: 'Pr. Josué Mendes (Comunidade da Fé)',
    clientPhone: '+5511984445566',
    companyName: 'Igreja Comunidade da Fé Central',
    expectedCategory: 'IMUNIDADE_TEMPLO',
    expectedPriority: 'HIGH'
  },
  {
    id: 'caso_complexo_fiscal',
    title: 'Caso Complexo / Notificação Fiscal',
    text: 'Recebemos uma intimação da SEFAZ com prazo de 5 dias úteis alegando divergência de recolhimento de ICMS-ST e SPED Fiscal dos últimos 2 anos. O valor apontado é de R$ 140.000,00. Precisamos de defesa urgente!',
    badge: 'CASO_COMPLEXO',
    badgeColor: 'bg-red-100 text-red-800',
    clientName: 'Dra. Helena Castro (BioFarma Distribuidora)',
    clientPhone: '+5511985556677',
    companyName: 'BioFarma Distribuição de Medicamentos',
    expectedCategory: 'CASO_COMPLEXO',
    expectedPriority: 'URGENT'
  },
  {
    id: 'falar_contador',
    title: 'Falar com Contador Responsável',
    text: 'Olá! Gostaria de agendar uma reunião presencial com o contador responsável na Yeshua nesta semana. Estamos estruturando uma holding patrimonial familiar e abertura de filial.',
    badge: 'FALAR_CONTADOR',
    badgeColor: 'bg-blue-100 text-blue-800',
    clientName: 'Fernando Guimarães (Grupo Aliança)',
    clientPhone: '+5511986667788',
    companyName: 'Grupo Aliança Empreendimentos',
    expectedCategory: 'FALAR_CONTADOR',
    expectedPriority: 'HIGH'
  }
];
