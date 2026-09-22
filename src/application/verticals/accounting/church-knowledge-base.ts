/**
 * Base de Conhecimento Canônica e Especializada para Igrejas e Entidades do Terceiro Setor
 * Vertical Contábil / Yeshua Consultoria & Contabilidade Eclesiástica
 *
 * Fundamentação: Constituição Federal de 1988, Código Tributário Nacional (CTN),
 * Legislação Previdenciária (Lei 8.212/91), eSocial, EFD-Reinf, DCTFWeb e Cartórios (RCPJ).
 */

export interface ChurchLegalReference {
  title: string;
  source: string;
  articleOrRule: string;
  summary: string;
}

export interface ChurchKnowledgeTopic {
  id: string;
  title: string;
  shortSummary: string;
  legalBasis: ChurchLegalReference[];
  detailedContent: string;
  keyPoints: string[];
  operationalChecklist: string[];
  risksAndPenalties: string[];
  escalationTriggers: string[];
  recommendedAction: string;
}

export const CHURCH_KNOWLEDGE_BASE: Record<string, ChurchKnowledgeTopic> = {
  IMUNIDADE_TRIBUTARIA: {
    id: 'IMUNIDADE_TRIBUTARIA',
    title: 'Imunidade Constitucional de Templos de Qualquer Culto',
    shortSummary:
      'Garantia pétrea do Art. 150, VI, "b" da CF/88 que veda a instituição de impostos sobre patrimônio, renda e serviços dos templos vinculados às finalidades essenciais.',
    legalBasis: [
      {
        title: 'Constituição Federal de 1988',
        source: 'Art. 150, VI, alínea "b" e § 4º da CF/88',
        articleOrRule: 'Art. 150, VI, "b"',
        summary: 'Veda à União, aos Estados, ao DF e aos Municípios instituir impostos sobre templos de qualquer culto.'
      },
      {
        title: 'Emenda Constitucional nº 116/2022',
        source: 'Art. 156, § 1º-A da CF/88',
        articleOrRule: 'EC 116/2022',
        summary:
          'Estende expressamente a imunidade de IPTU aos imóveis alugados ou cedidos utilizados para as finalidades essenciais da entidade religiosa.'
      },
      {
        title: 'Código Tributário Nacional (CTN)',
        source: 'Lei nº 5.172/1966, Art. 14',
        articleOrRule: 'Art. 14 do CTN',
        summary:
          'Requisitos de eficácia: não distribuir qualquer patrimônio ou renda, aplicar integralmente recursos no país para objetivos institucionais e manter escrituração contábil regular.'
      },
      {
        title: 'Jurisprudência Vinculante do STF',
        source: 'Tema 342 e Súmula Vinculante 52',
        articleOrRule: 'STF RE 562.351 e Súmula Vinculante 52',
        summary:
          'A imunidade tributária abrange imóveis próprios, locados e veículos (IPVA, ITCMD, ISS) desde que destinados às atividades essenciais do culto.'
      }
    ],
    detailedContent: `A Imunidade Tributária Religiosa é uma garantia constitucional pétrea (Art. 150, VI, 'b', CF/88) que impede os entes federativos de tributar templos de qualquer culto.

1. Tributos Imunes (Impostos):
- IPTU: Não incide sobre imóveis onde funcionam templos, templos-sede, congregações, casas pastorais integradas ao ministério ou estacionamentos do templo. Com a EC 116/2022, a imunidade de IPTU aplica-se mesmo para imóveis alugados ou cedidos, cabendo à igreja protocolar o requerimento de imunidade junto à Prefeitura com a juntada do contrato de locação e ata de posse.
- IPVA: Não incide sobre veículos de propriedade da entidade religiosa utilizados nas atividades pastorais e eclesiásticas.
- ITCMD: Não incide sobre doações, heranças, legados e transferências patrimoniais recebidas pela igreja para aplicação no templo.
- ISS: Não incide sobre serviços próprios vinculados à atividade-fim e aos ritos espirituais. (Atenção: A igreja continua responsável pela retenção do ISS de prestadores terceirizados).
- IRPJ e CSLL: Isenção e imunidade plena sobre receitas de dízimos, ofertas, doações e rendimentos de aplicações financeiras institucionais.

2. Requisitos Mandatórios do Art. 14 do CTN:
- Não distribuir qualquer parcela de seu patrimônio ou de suas rendas, a qualquer título (vedação a lucros, bonificações ou dividendos a diretores).
- Aplicar integralmente no país os seus recursos na manutenção e desenvolvimento dos seus objetivos institucionais.
- Manter escrituração completa de suas receitas e despesas em livros revestidos de formalidades capazes de assegurar sua exatidão (ECF / ECD e Livro Caixa).`,
    keyPoints: [
      'Abrange IPTU (inclusive imóveis alugados conforme EC 116/2022), IPVA, ITCMD, ISS, IRPJ e CSLL.',
      'Não é isenção infraconstitucional revogável: é imunidade pétrea da Constituição Federal.',
      'Exige cumprimento rigoroso do Art. 14 do CTN (sem distribuição de lucros, aplicação nacional dos recursos e contabilidade formal).',
      'Taxas municipais/estaduais (como taxa de lixo ou custas) e contribuições de melhoria não estão abrangidas pela imunidade.'
    ],
    operationalChecklist: [
      'Protocolar requerimento de reconhecimento de imunidade de IPTU na Secretaria de Finanças Municipal.',
      'Apresentar contrato de locação registrado caso o imóvel seja alugado para culto (EC 116/2022).',
      'Manter cópia da Ata de Posse da Diretoria e Estatuto Social atualizados em RCPJ.',
      'Garantir a escrituração contábil idônea anual (ECF) para comprovar a aplicação dos recursos nas finalidades religiosas.'
    ],
    risksAndPenalties: [
      'Cobrança indevida de IPTU/ISS por falta de protocolo cadastral no Município.',
      'Perda da imunidade ou autuação fiscal da Receita Federal caso haja distribuição disfarçada de lucros ou desvio de finalidade.',
      'Inscrição em Dívida Ativa municipal por inércia na apresentação de defesa fundamentada.'
    ],
    escalationTriggers: [
      'notificação fiscal de iptu',
      'cobrança indevida de iptu',
      'auto de infração iss igreja',
      'cobrança de irpj igreja',
      'perda de imunidade'
    ],
    recommendedAction:
      'Elaborar requerimento administrativo ou defesa de imunidade tributária com suporte na EC 116/2022 e Art. 150 da CF/88, instruído com Estatuto, Ata de Posse e Escrituração Contábil.'
  },

  PREBENDA_PASTORAL: {
    id: 'PREBENDA_PASTORAL',
    title: 'Prebenda Pastoral / Ministros de Confissão Religiosa & eSocial',
    shortSummary:
      'Regime jurídico e fiscal da remuneração eclesiástica (prebenda/cômodo pastoral), categorizado no eSocial 701, sem FGTS, INSS como contribuinte individual e IRRF progressivo.',
    legalBasis: [
      {
        title: 'Lei da Previdência Social',
        source: 'Lei nº 8.212/1991, Art. 12, inciso V, alínea "c"',
        articleOrRule: 'Art. 12, V, "c" da Lei 8.212/91',
        summary:
          'Enquadra o ministro de confissão religiosa e membros de instituto de vida consagrada como segurado obrigatório da Previdência na qualidade de Contribuinte Individual.'
      },
      {
        title: 'Isenção de Cota Patronal Previdenciária',
        source: 'Lei nº 8.212/1991, Art. 22, § 13 (incluído pela Lei nº 10.170/2000 e ratificado pela Lei nº 14.647/2023)',
        articleOrRule: 'Art. 22, § 13 da Lei 8.212/91',
        summary:
          'Não se considera remuneração direta para fins previdenciários patronais os valores despendidos pelas entidades religiosas com ministros de confissão religiosa para seu sustento.'
      },
      {
        title: 'Inexistência de Vínculo de Emprego',
        source: 'Lei nº 14.647/2023 (alterou a CLT Art. 442)',
        articleOrRule: 'Art. 442, § 2º e § 3º da CLT',
        summary:
          'Inexistência de vínculo empregatício entre entidades religiosas ou instituições de ensino vocacional e seus ministros, pastores, padres ou assemelhados.'
      },
      {
        title: 'Regulamento do Imposto de Renda (RIR/2018)',
        source: 'Decreto nº 9.580/2018, Art. 36 e Instrução Normativa RFB nº 1.500/2014',
        articleOrRule: 'Tabela Progressiva Mensal do IRRF',
        summary:
          'A prebenda pastoral sofre retenção de Imposto de Renda na Fonte (IRRF) conforme tabela progressiva vigente, recolhido pela igreja via DCTFWeb/DARF.'
      }
    ],
    detailedContent: `A Prebenda Pastoral (também denominada múnus eclesiástico, côngrua ou sustento pastoral) é o valor concedido pela igreja ao ministro de confissão religiosa para prover sua subsistência e de sua família, permitindo sua dedicação exclusiva ou parcial ao pastoreio.

1. Natureza Jurídica:
- Não tem natureza salarial nem trabalhista (não incide CLT, férias + 1/3, 13º salário obrigatório, aviso prévio ou horas extras).
- A Lei Federal nº 14.647/2023 consolidou em definitivo a ausência de relação de emprego entre o pastor/ministro e a igreja.

2. FGTS (Fundo de Garantia por Tempo de Serviço):
- Não incidência absoluta de FGTS (Lei nº 8.036/1990). A igreja não recolhe nem deposita FGTS sobre prebendas.

3. INSS / Previdência Social:
- O pastor é segurado obrigatório da Previdência Social como Contribuinte Individual (Art. 12, V, 'c' da Lei 8.212/1991).
- Cota Patronal da Igreja: A igreja está dispensada do recolhimento dos 20% da cota patronal previdenciária sobre o valor da prebenda (conforme § 13 do Art. 22 da Lei 8.212/1991).
- O recolhimento previdenciário pessoal do pastor é feito por ele mesmo (20% sobre a base declarada via carnê/GPS própria) ou, se houver deliberação estatutária/convenial, intermediado conforme regras vigentes.

4. eSocial e Escrituração:
- Categoria eSocial: Categoria 701 ("Contribuinte individual - Ministro de confissão religiosa ou membro de instituto de vida consagrada").
- Eventos eSocial:
  * S-2300: Cadastro de Trabalhador Sem Vínculo de Emprego - Início.
  * S-1200: Remuneração de Trabalhador sem Vínculo (valor da prebenda informada).
  * S-1210: Pagamento de Rendimentos do Trabalho (informações do pagamento e quitação).

5. IRRF (Imposto de Renda Retido na Fonte):
- Aplica-se a Tabela Progressiva Mensal da Receita Federal.
- A igreja deve reter o IRRF na fonte sobre os valores que ultrapassarem a faixa de isenção, recolhendo via DCTFWeb/DARF até o dia 20 do mês subsequente.
- As informações de IRRF são declaradas na EFD-Reinf (Série R-4000 / R-4010) e alimentam o Informe Anual de Rendimentos do pastor.`,
    keyPoints: [
      'Enquadramento estrito no eSocial Categoria 701 (Ministro de confissão religiosa).',
      'Não incide FGTS e inexiste vínculo trabalhista (Lei 14.647/2023).',
      'Isenção da cota patronal previdenciária de 20% para a igreja (Art. 22, § 13 da Lei 8.212/91).',
      'Incidência mandatória de IRRF pela tabela progressiva mensal, recolhido via DCTFWeb/DARF.'
    ],
    operationalChecklist: [
      'Cadastrar o pastor no eSocial pelo evento S-2300 sob a categoria 701.',
      'Emitir recibo formal mensal de prebenda pastoral com destaque da retenção de IRRF (se houver).',
      'Transmitir mensalmente a folha no eSocial (S-1200/S-1210) e fechar na DCTFWeb.',
      'Emitir e disponibilizar anualmente o Informe de Rendimentos para a declaração de IRPF do pastor.'
    ],
    risksAndPenalties: [
      'Tratar o pastor indevidamente como empregado CLT (categoria 101), gerando custos indevidos de FGTS e encargos sindicais.',
      'Deixar de reter e recolher o IRRF, sujeitando a igreja a multas de ofício de 75% da Receita Federal por apropriação indébita tributária.',
      'Omissão no eSocial categoria 701, gerando impedimento na CND Federal.'
    ],
    escalationTriggers: [
      'cobrança de inss patronal sobre prebenda',
      'cobrança de fgts pastor',
      'autuação fiscal irrf prebenda',
      'processo trabalhista pastor vínculo'
    ],
    recommendedAction:
      'Garantir o enquadramento na Categoria 701 do eSocial, emissão regular de recibos de prebenda com cálculo da retenção do IRRF e fechamento na DCTFWeb.'
  },

  OBRIGACOES_ACESSORIAS: {
    id: 'OBRIGACOES_ACESSORIAS',
    title: 'Obrigações Acessórias: ECF, ECD, DCTFWeb, EFD-Reinf e eSocial',
    shortSummary:
      'Conjunto de declarações digitais obrigatórias da Receita Federal para comprovação de imunidade e manutenção da regularidade fiscal do CNPJ eclesiástico.',
    legalBasis: [
      {
        title: 'Escrituração Contábil Fiscal (ECF)',
        source: 'Instrução Normativa RFB nº 2.004/2021',
        articleOrRule: 'IN RFB 2.004/2021',
        summary:
          'Obrigatória anualmente para todas as entidades imunes e isentas, mesmo sem movimento expressivo, com entrega até o último dia útil de julho.'
      },
      {
        title: 'Escrituração Contábil Digital (ECD)',
        source: 'Instrução Normativa RFB nº 2.003/2021',
        articleOrRule: 'IN RFB 2.003/2021',
        summary:
          'Obrigatória para imunes/isentas que auferirem receitas/doações anuais superiores ao teto regulamentar ou que mantenham escrituração mercantil completa.'
      },
      {
        title: 'DCTFWeb & EFD-Reinf',
        source: 'IN RFB nº 2.005/2021 e IN RFB nº 2.043/2021',
        articleOrRule: 'Série R-4000 (EFD-Reinf) e DCTFWeb',
        summary:
          'Transmissão mensal até o dia 15 do mês subsequente para confissão e geração unificada de DARF de contribuições previdenciárias e retenções de IRRF/prebendas.'
      },
      {
        title: 'eSocial Governamental',
        source: 'Decreto nº 8.373/2014 e Manual de Orientação do eSocial (MOS)',
        articleOrRule: 'Grupo 3 - Entidades Sem Fins Lucrativos',
        summary:
          'Obrigatoriedade de envio de eventos S-1000 (Tabelas), S-2300 (Trabalhadores sem Vínculo/Pastores) e eventos de remuneração periódica.'
      }
    ],
    detailedContent: `Mesmo imunes e sem fins lucrativos, as igrejas estão plenamente submetidas às obrigações acessórias do Sistema Público de Escrituração Digital (SPED) da Receita Federal. O não envio dessas declarações é a causa número 1 de bloqueio de CND e CNPJ Inapto.

1. ECF (Escrituração Contábil Fiscal):
- Periodicidade: Anual (geralmente até o último dia útil de julho).
- Objetivo: Declarar a origem das receitas (dízimos, doações, campanhas missionárias) e a comprovação da aplicação integral dos recursos no objeto social da igreja (requisito do Art. 14 do CTN).
- Bloco Imunes/Isentas: Preenchimento de balanço patrimonial, DRE, plano de contas e demonstração do superávit/déficit.

2. ECD (Escrituração Contábil Digital - SPED Contábil):
- Periodicidade: Anual (último dia útil de maio).
- Envio do Livro Diário e Livro Razão digitais chancelados pelo profissional de contabilidade habilitado no CRC e pelo presidente da igreja via Certificado Digital e-CNPJ/e-CPF.

3. DCTFWeb:
- Periodicidade: Mensal (até o dia 15 do mês seguinte ao fato gerador).
- Substituiu a antiga GFIP/SEFIP e DCTF convencional para créditos previdenciários e retenções de IRRF.
- Consolida automaticamente os dados transmitidos pelo eSocial e pela EFD-Reinf, emitindo a DARF Previdenciária única com código de barras/PIX.

4. EFD-Reinf:
- Periodicidade: Mensal.
- Série R-4000 (R-4010 e R-4020): Informação de pagamentos a pessoas físicas (inclusive prebendas e autônomos sujeitos a IRRF) e retenções de serviços tomados de pessoas jurídicas.

5. eSocial:
- Centraliza as informações relativas aos colaboradores CLT (zeladoria, secretária) e aos ministros de confissão religiosa (categoria 701).`,
    keyPoints: [
      'Entidade religiosa NÃO é isenta de obrigações acessórias: omissão gera CNPJ Inapto.',
      'ECF anual é o documento mestre que protege a imunidade da igreja perante a Receita Federal.',
      'DCTFWeb e EFD-Reinf são mensais e vinculadas à emissão das DARFs unificadas.',
      'Certificado Digital e-CNPJ da igreja é pré-requisito técnico para a transmissão.'
    ],
    operationalChecklist: [
      'Conferir o cronograma anual de entrega: ECD (Maio), ECF (Julho), DCTFWeb (Mensal dia 15).',
      'Realizar fechamento mensal das prebendas e notas de tomador na EFD-Reinf.',
      'Gerar e pagar a DARF unificada da DCTFWeb até o dia 20 de cada mês.',
      'Emitir espelho da CND Conjunta Federal logo após o fechamento para certificar ausência de pendências.'
    ],
    risksAndPenalties: [
      'Multa mínima de R$ 500,00 por declaração em atraso (ECF/ECD/DCTFWeb).',
      'Inaptidão cadastral do CNPJ por omissão contumaz de declarações (Art. 81 da Lei 9.430/1996).',
      'Trancamento de certidões negativas e impossibilidade de manter contas bancárias ativas.'
    ],
    escalationTriggers: [
      'multa por atraso ecf',
      'multa dctfweb',
      'cnpj inapto omissão de declarações',
      'notificação sped receita federal'
    ],
    recommendedAction:
      'Efetuar o levantamento imediato do histórico fiscal no portal e-CAC da Receita Federal, transmitindo as declarações pendentes e solicitando parcelamento ou impugnação se houver multa indevida.'
  },

  REGULARIDADE_ESTATUTO_ATA: {
    id: 'REGULARIDADE_ESTATUTO_ATA',
    title: 'Regularidade Jurídica e Cartorial: Estatuto Social, Ata de Posse em RCPJ e DBE',
    shortSummary:
      'Ciclo de validade cartorial e eclesiástica da diretoria. O mandato vencido de ata é o principal causador de bloqueio de contas bancárias por compliance do Bacen.',
    legalBasis: [
      {
        title: 'Código Civil Brasileiro',
        source: 'Lei nº 10.406/2002, Art. 44, IV e Art. 53 a 61',
        articleOrRule: 'Art. 44, IV do Código Civil',
        summary:
          'Classifica as organizações religiosas como pessoas jurídicas de direito privado, com liberdade de criação, organização e estruturação interna.'
      },
      {
        title: 'Lei dos Registros Públicos',
        source: 'Lei nº 6.015/1973, Art. 114 a 121',
        articleOrRule: 'Registro Civil de Pessoas Jurídicas (RCPJ)',
        summary:
          'Obrigatoriedade de averbação em RCPJ dos atos constitutivos, estatutos e atas de eleição e posse da diretoria para eficácia jurídica erga omnes.'
      },
      {
        title: 'Normas do Banco Central do Brasil (Bacen)',
        source: 'Resolução BCB nº 96/2021 e Circular Bacen nº 3.978/2020',
        articleOrRule: 'Compliance & KYC Bancário',
        summary:
          'As instituições financeiras são obrigadas a bloquear movimentações de contas de pessoas jurídicas com representação estatutária ou mandato de diretoria expirados.'
      },
      {
        title: 'Cadastro Nacional da Pessoa Jurídica (CNPJ)',
        source: 'Instrução Normativa RFB nº 2.119/2022',
        articleOrRule: 'Coletor Nacional / DBE - Evento 202',
        summary:
          'Atualização cadastral do representante legal e Quadro de Sócios e Administradores (QSA) mediante apresentação de ata registrada.'
      }
    ],
    detailedContent: `A regularidade da igreja perante o Estado depende estritamente do trinômio: Estatuto Social Registrado + Ata de Eleição/Posse Vigente no RCPJ + DBE atualizado no CNPJ da Receita Federal.

1. Estatuto Social da Igreja:
- Documento constitucional da entidade registrado no Cartório de Registro Civil de Pessoas Jurídicas (RCPJ).
- Deve conter obrigatoriamente: denominação, fins religiosos, sede, tempo de duração, modo de administração, representação ativa e passiva, requisitos para admissão e exclusão de membros, fontes de recursos e destinação do patrimônio residual em caso de dissolução para outra entidade religiosa imune.

2. Ata de Eleição e Posse da Diretoria:
- Toda diretoria executiva (Presidente, Vice, Tesoureiro, Secretário, Conselho Fiscal) possui mandato por prazo determinado fixado no estatuto (geralmente de 2 a 4 anos).
- Findo o mandato, deve ser realizada Assembleia Geral Ordinária de Eleição e Posse, cuja ata deve ser levada a registro no RCPJ antes do término do mandato anterior para evitar interrupção na gestão legal.

3. DBE (Documento Básico de Entrada) e QSA no CNPJ:
- Após a averbação da ata no cartório, é mandatório gerar o DBE no portal Redesim/Receita Federal com o evento "202 - Alteração da pessoa física responsável perante o CNPJ" e atualização do QSA.
- O presidente empossado assume a responsabilidade civil e fiscal do CNPJ.

4. O Risco Imediato do Mandato Vencido (Bloqueio Bancário):
- Os bancos realizam cruzamento periódico via sistemas de compliance (Know Your Customer - KYC).
- Se o mandato registrado no sistema bancário expirar:
  * Acesso ao Internet Banking e PIX é bloqueado sumariamente.
  * Assinatura de cheques e transferências para pagamento de aluguéis, prebendas e contas públicas são rejeitadas.
  * O Certificado Digital e-CNPJ da igreja perde a validade e não pode ser renovado sem a apresentação de ata vigente registrada em cartório.`,
    keyPoints: [
      'Mandato de diretoria vencido acarreta bloqueio imediato das contas bancárias da igreja.',
      'Certificado digital e-CNPJ não pode ser emitido nem renovado com ata expirada.',
      'Ata de Eleição deve ser averbada no RCPJ e imediatamente refletida no CNPJ via DBE.',
      'Estatuto deve proibir remuneração de dirigentes pelo exercício estatutário administrativo, salvaguardando a prebenda ministerial espiritual.'
    ],
    operationalChecklist: [
      'Verificar a data de expiração do mandato da diretoria atual com antecedência de 90 dias.',
      'Publicar o edital de convocação da Assembleia Geral conforme previsto no Estatuto.',
      'Realizar a assembleia, colher assinaturas e registrar a ata com lista de presença no RCPJ.',
      'Emitir o DBE pelo portal Redesim para sincronização cadastral no CNPJ da Receita Federal.',
      'Apresentar a nova ata averbada e cartão CNPJ atualizado ao gerente da agência bancária.'
    ],
    risksAndPenalties: [
      'Bloqueio operacional de contas bancárias e paralisação dos pagamentos de rotina da igreja.',
      'Invalidação jurídica dos atos praticados por diretoria de fato com mandato vencido.',
      'Impossibilidade de emissão de Certificado Digital para cumprimento das obrigações acessórias (ECF, DCTFWeb).'
    ],
    escalationTriggers: [
      'conta bancária bloqueada',
      'banco bloqueou conta da igreja',
      'mandato vencido',
      'ata de posse vencida',
      'bloqueio de pix igreja',
      'recusa de renovação certificado digital ata'
    ],
    recommendedAction:
      'Convocar Assembleia Geral extraordinária em caráter de urgência, lavrar a ata de reeleição/posse, submeter ao RCPJ com pedido de urgência cartorial e transmitir DBE à Receita Federal para desbloqueio bancário.'
  },

  CERTIDOES_CND: {
    id: 'CERTIDOES_CND',
    title: 'Certidões Negativas: CND Conjunta RFB/PGFN, CRF do FGTS e CADIN',
    shortSummary:
      'Comprovantes oficiais de regularidade fiscal e cadastral perante a Fazenda Nacional, Previdência e FGTS para abertura de contas, convênios e proteção patrimonial.',
    legalBasis: [
      {
        title: 'Certidão Conjunta RFB/PGFN',
        source: 'Portaria Conjunta RFB/PGFN nº 1.751/2014',
        articleOrRule: 'Art. 1º ao 15 da Portaria 1.751/14',
        summary:
          'Comprova a inexistência de débitos de tributos federais administrados pela Receita Federal e de inscrições em Dívida Ativa da União perante a PGFN.'
      },
      {
        title: 'Certificado de Regularidade do FGTS (CRF)',
        source: 'Lei nº 8.036/1990, Art. 27 e Circular Caixa',
        articleOrRule: 'Art. 27 da Lei 8.036/90',
        summary:
          'Comprova que a entidade está regular com o recolhimento do FGTS perante a Caixa Econômica Federal, sendo exigido mesmo sem empregados celetistas.'
      },
      {
        title: 'CADIN Federal',
        source: 'Lei nº 10.522/2002',
        articleOrRule: 'Art. 1º a 8º da Lei 10.522/02',
        summary:
          'Registro cadastral de créditos não quitados do setor público federal. A inscrição no CADIN impede a celebração de termos de fomento, subvenções e concessões.'
      }
    ],
    detailedContent: `A Certidão Negativa de Débitos (CND) é a prova cabal da conformidade e lisura fiscal da igreja. A Yeshua monitora preventivamente três certidões cardeais:

1. CND Conjunta da Receita Federal e PGFN:
- Abrange débitos previdenciários (antiga CND do INSS), tributos federais e Dívida Ativa da União.
- Validade: 180 dias.
- Principais causas de travamento para igrejas: omissão de ECF/DCTFWeb/EFD-Reinf, divergência de IRRF sobre prebendas ou falta de entrega de GFIPs/eSocial em competências anteriores.

2. CRF do FGTS (Caixa Econômica Federal):
- Validade: 30 dias.
- Muitas igrejas não possuem empregados com carteira assinada (possuindo apenas voluntários e ministros religiosos). Contudo, para obter o CRF, a igreja deve enviar periodicamente declaração de "Ausência de Fato Gerador" no eSocial para a Caixa manter a certidão ativa.

3. Consulta ao CADIN Federal:
- O Cadastro Informativo de Créditos não Quitados lista pendências financeiras com órgãos federais (como multas de órgãos de trânsito em veículos da igreja, multas do Ministério do Trabalho ou execuções fiscais).
- Estar limpo no CADIN é indispensável para evitar penhora online de recursos do dízimo.`,
    keyPoints: [
      'CND Conjunta RFB/PGFN tem validade de 180 dias e abrange tributos e previdência.',
      'CRF do FGTS deve ser mantido regular mesmo sem funcionários CLT, via eSocial sem movimento.',
      'Ocorrência de débitos trava imediatamente financiamentos, locações com grandes players e convênios públicos.',
      'Monitoramento automatizado mensal impede surpresas em renovações cadastrais.'
    ],
    operationalChecklist: [
      'Emitir mensalmente a CND Conjunta RFB/PGFN pelo portal e-CAC.',
      'Verificar o CRF da Caixa pelo portal Regularidade FGTS da Caixa.',
      'Consultar a situação fiscal completa no e-CAC em busca de pendências de malha fiscal antes do vencimento das certidões.',
      'Caso haja débito indevido, apresentar Pedido de Revisão de Débito (PRDI) ou impugnação fundamentada.'
    ],
    risksAndPenalties: [
      'Impedimento na compra ou venda de imóveis e veículos em nome da igreja.',
      'Recusa bancária para renovação de limites, empréstimos institucionais ou convênios de arrecadação.',
      'Encaminhamento de débitos não impugnados para inscrição na Dívida Ativa da União com acréscimo de 20% de encargos legais.'
    ],
    escalationTriggers: [
      'cnd travada',
      'cnd positiva com efeitos de negativa',
      'inscrição em dívida ativa da união',
      'pendência no cadin igreja',
      'crf fgts irregular'
    ],
    recommendedAction:
      'Emitir o Relatório de Situação Fiscal no e-CAC para identificar a guia ou declaração causadora do travamento, regularizando a obrigação ou comprovando a inexigibilidade via processo digital.'
  },

  VOLUNTARIADO_LEI_9608: {
    id: 'VOLUNTARIADO_LEI_9608',
    title: 'Termo de Adesão ao Serviço Voluntário (Lei Federal nº 9.608/1998)',
    shortSummary:
      'Instrumento jurídico obrigatório para prevenir passivos trabalhistas com voluntários de louvor, músicos, mídia, recepção, diaconia, secretaria e escola dominical.',
    legalBasis: [
      {
        title: 'Lei do Serviço Voluntário',
        source: 'Lei Federal nº 9.608/1998',
        articleOrRule: 'Art. 1º, 2º e 3º da Lei 9.608/98',
        summary:
          'Define serviço voluntário a atividade não remunerada prestada por pessoa física a entidade sem fins lucrativos com objetivos cívicos, culturais, educacionais, científicos, recreativos ou de assistência social e religiosa.'
      },
      {
        title: 'Inexistência Expressa de Vínculo Trabalhista',
        source: 'Lei nº 9.608/1998, Art. 1º, Parágrafo Único',
        articleOrRule: 'Art. 1º, Parágrafo Único',
        summary:
          'O serviço voluntário não gera vínculo empregatício, nem obrigação de natureza trabalhista, previdenciária ou afim.'
      },
      {
        title: 'Requisito da Forma Escrita',
        source: 'Lei nº 9.608/1998, Art. 2º',
        articleOrRule: 'Art. 2º da Lei 9.608/98',
        summary:
          'O serviço voluntário será exercido mediante a celebração de termo de adesão entre a entidade e o prestador do serviço voluntário, dele devendo constar o objeto e as condições de seu exercício.'
      }
    ],
    detailedContent: `O trabalho voluntário é a espinha dorsal da operação das igrejas no Brasil: equipe de louvor, coral, instrumentistas, sonoplastas, cinegrafistas, operadores de transmissão ao vivo (mídia), recepcionistas de culto, diáconos, porteiros, conselheiros, professores de escola bíblica e equipes de acolhimento.

1. O Grande Risco Jurídico:
- Na Justiça do Trabalho brasileira, a habitualidade, subordinação e dependência podem induzir juízes e auditores a presumirem vínculo empregatício e relação de emprego CLT se não houver prova documental idônea da causa religiosa/espiritual voluntária.
- Reclamatórias trabalhistas ajuizadas por ex-membros (especialmente músicos, técnicos de som e líderes de ministério) cobrando horas extras, adicional noturno, férias, 13º e FGTS de anos de dedicação geram passivos milionários e penhora de dízimos.

2. Requisitos Mandatórios do Termo de Adesão:
- Deve ser obrigatoriamente formalizado POR ESCRITO antes do início das atividades.
- Cláusula expressa citando a Lei Federal nº 9.608/1998.
- Declaração irrevogável de que a atividade é motivada por fé e dever cívico-religioso, sem qualquer contraprestação financeira ou subordinação trabalhista.
- Delimitação clara do objeto (ex.: "atuação como instrumentista voluntário nas celebrações de domingo e ensaios semanais").
- Vedação expressa a qualquer pagamento de "ajuda de custo fixa mensal desprovida de comprovante" que possa ser interpretada como salário disfarçado.

3. Ressarcimento de Despesas (Art. 3º da Lei 9.608/98):
- O voluntário pode ser ressarcido de despesas que comprovadamente realizar no desempenho das atividades voluntárias (ex.: combustível para visita externa missionária ou alimentação em retiro espiritual), desde que previamente autorizadas pela diretoria da igreja e comprovadas mediante nota fiscal idônea em nome da igreja.`,
    keyPoints: [
      'Todo voluntário de louvor, mídia, recepção ou ministério deve assinar o Termo de Adesão.',
      'A formalização escrita é obrigatória por força do Art. 2º da Lei 9.608/98: acordo verbal é nulo perante a Justiça do Trabalho.',
      'Nunca pagar valores fixos mensais a título de "ajuda de custo" sem comprovação de despesa, pois caracteriza salário disfarçado.',
      'Ressarcimentos só são admitidos com nota fiscal prévia e autorizada.'
    ],
    operationalChecklist: [
      'Mapear todos os voluntários ativos em todos os ministérios e congregações da igreja.',
      'Colher assinatura anual no Termo de Adesão ao Serviço Voluntário individualizado.',
      'Arquivar as vias físicas ou assinaturas digitais em pasta de conformidade jurídica da secretaria.',
      'Orientar a liderança de departamentos a não exercer subordinação hierárquica análoga à empresarial (ex.: não aplicar advertências ou punições formais trabalhistas).'
    ],
    risksAndPenalties: [
      'Reconhecimento de vínculo empregatício de músicos e operadores na Justiça do Trabalho com condenação retroativa a 5 anos de encargos.',
      'Bloqueio judicial via BacenJud/SisbaJud das contas bancárias da igreja para pagamento de condenações trabalhistas.',
      'Multa do Ministério do Trabalho por manter trabalhadores sem registro regular.'
    ],
    escalationTriggers: [
      'processo trabalhista voluntário louvor',
      'notificação ministério do trabalho igreja',
      'reclamação trabalhista músico igreja',
      'cobrança de salário voluntário'
    ],
    recommendedAction:
      'Implantar imediatamente a política de conformidade eclesiástica com a assinatura universal do Termo de Adesão com base na Lei 9.608/1998 para 100% dos voluntários, cessando pagamentos informais em espécie.'
  },

  DOACOES_DIZIMOS: {
    id: 'DOACOES_DIZIMOS',
    title: 'Segregação Patrimonial e Recibos de Dízimos e Doações',
    shortSummary:
      'Diretrizes de conformidade financeira e contábil: proibição estrita de confusão patrimonial entre a pessoa física do pastor e o CNPJ da igreja, escrituração de entradas e controle de recibos.',
    legalBasis: [
      {
        title: 'Princípio Contábil da Entidade',
        source: 'Resolução CFC nº 1.282/2010 e ITG 2002 (R1)',
        articleOrRule: 'Princípio da Entidade e ITG 2002',
        summary:
          'O patrimônio da entidade não se confunde com o de seus dirigentes ou membros. As entradas devem transitar estritamente em contas de titularidade do CNPJ.'
      },
      {
        title: 'Código Tributário Nacional - Destinação de Recursos',
        source: 'Lei nº 5.172/1966, Art. 14, II',
        articleOrRule: 'Art. 14, II do CTN',
        summary:
          'A aplicação de todos os recursos recebidos deve ocorrer no desenvolvimento das finalidades institucionais, sob pena de perda imediata da imunidade tributária.'
      },
      {
        title: 'Lei da Lavagem de Dinheiro & COAF',
        source: 'Lei Federal nº 9.613/1998 e Resoluções COAF',
        articleOrRule: 'Operações em Espécie e Origem de Recursos',
        summary:
          'Monitoramento de grandes depósitos em dinheiro em espécie sem identificação da origem, exigindo controles internos rígidos e depósitos bancários rastreáveis.'
      }
    ],
    detailedContent: `A gestão de dízimos e ofertas em templos religiosos requer rigor contábil absoluto para proteger tanto a igreja quanto os próprios pastores contra acusações de apropriação indébita, enriquecimento sem causa, sonegação e desvio de finalidade.

1. Segregação Patrimonial Estrita:
- NUNCA receber dízimos ou ofertas em contas bancárias pessoais ou chaves PIX de pessoas físicas (nem do pastor presidente, nem do tesoureiro, nem de dirigentes).
- Todas as doações devem ser recebidas via conta bancária, PIX oficial com a chave do CNPJ ou boletos em nome da entidade religiosa.
- Despesas pessoais de pastores (contas de luz de casa própria, supermercado pessoal, viagens particulares) jamais devem ser debitadas diretamente no cartão ou na conta da igreja; devem ser pagas pelo próprio pastor com o recurso líquido da sua prebenda recebida regularmente.

2. Recibos de Doações e Dízimos:
- Para doações vultosas ou quando solicitado pelo fiel para fins de transparência ou doação específica de bens:
  * Emitir recibo formal com logotipo da igreja, CNPJ, dados do doador (Nome e CPF), valor por extenso e data.
  * O dízimo recebido pela igreja é isento de tributação para a igreja, mas não é dedutível na declaração de IRPF do doador no Brasil (diferente de doações aos fundos da infância/idoso).

3. Livro Caixa e Prestação de Contas:
- Registro cronológico de todas as receitas e despesas com documentos fiscais idôneos (notas fiscais eletrônicas, recibos de prebenda, guias de encargos recolhidas).
- Apresentação periódica de balancetes à Assembleia Geral de Membros e ao Conselho Fiscal, assegurando governança e credibilidade institucional.`,
    keyPoints: [
      'Proibição absoluta de chaves PIX de pessoa física para recebimento de dízimos da igreja.',
      'Segregação total: a conta jurídica da igreja não paga despesas pessoais da família pastoral.',
      'O sustento pastoral deve ser pago exclusivamente como prebenda formalizada, nunca como pagamento avulso.',
      'Escrituração contábil regular protege a liderança contra auditorias da Receita e denúncias internas.'
    ],
    operationalChecklist: [
      'Cadastrar a chave PIX institucional no banco vinculado exclusivamente ao CNPJ da igreja.',
      'Elaborar e divulgar termo interno orientando os membros a transferirem apenas para a conta oficial da igreja.',
      'Contar ofertas e dízimos por comissão de no mínimo 2 membros com preenchimento de boletim de tesouraria assinado.',
      'Depositar integralmente os valores em espécie na conta bancária da igreja no primeiro dia útil subsequente ao culto.'
    ],
    risksAndPenalties: [
      'Autuação da Receita Federal por omissão de receita e confusão patrimonial, gerando quebra da imunidade constitucional.',
      'Tributação das doações na pessoa física do pastor caso o dinheiro transite em sua conta pessoal, com cobrança de IR de até 27,5% + multa de 75%.',
      'Denúncias no Ministério Público por apropriação indébita ou estelionato religioso por falta de prestação de contas.'
    ],
    escalationTriggers: [
      'pastor recebendo dízimo na conta física',
      'malha fina pastor dízimo',
      'denúncia confusão patrimonial igreja',
      'fiscalização receitas eclesiásticas'
    ],
    recommendedAction:
      'Instalar imediatamente política de compliance financeiro eclesiástico: migração de todas as chaves PIX para o CNPJ, estruturação de Livro Caixa com conciliação bancária 100% e formalização das prebendas.'
  },

  CERTIFICADO_DIGITAL: {
    id: 'CERTIFICADO_DIGITAL',
    title: 'Certificado Digital e-CNPJ da Igreja e Procuração Eletrônica RFB',
    shortSummary:
      'Identidade digital indispensável para cumprimento de obrigações no e-CAC, eSocial, DCTFWeb e emissão de notas fiscais, exigindo estrita conformidade da ata em cartório.',
    legalBasis: [
      {
        title: 'Medida Provisória nº 2.200-2/2001',
        source: 'ICP-Brasil',
        articleOrRule: 'Art. 1º ao 15 da MP 2.200-2/01',
        summary:
          'Institui a Infraestrutura de Chaves Públicas Brasileira (ICP-Brasil) para garantir a autenticidade, integridade e validade jurídica de documentos em forma eletrônica.'
      },
      {
        title: 'Normas da RFB sobre Procuração Eletrônica',
        source: 'Instrução Normativa RFB nº 2.066/2022',
        articleOrRule: 'Procuração RFB via e-CAC',
        summary:
          'Permite a delegação eletrônica segura dos poderes de transmissão das obrigações da igreja diretamente ao escritório de contabilidade credenciado.'
      }
    ],
    detailedContent: `O Certificado Digital (padrão e-CNPJ A1 ou A3) é a chave de acesso da igreja aos sistemas públicos digitais. Sem ele, a entidade fica paralisada.

1. Usabilidade Técnica:
- Acesso integral ao portal e-CAC da Receita Federal.
- Transmissão de eventos no eSocial e fechamento de guias na DCTFWeb.
- Envio da ECF e ECD no SPED.
- Consulta de pendências de malha fiscal e emissão de certidões.

2. Regra de Ouro para Emissão / Renovação:
- Para a autoridade certificadora validar o e-CNPJ, ela exige obrigatoriamente:
  * Cartão CNPJ ativo na Receita Federal.
  * Estatuto Social registrado no RCPJ.
  * Ata de Eleição e Posse vigente registrada no RCPJ demonstrando que o representante legal está com mandato válido.
  * Documentos pessoais (RG, CNH, CPF) do Presidente/Representante perante o CNPJ.
- Se o mandato estiver vencido no cartório, NENHUMA certificadora autorizada pelo ICP-Brasil tem autorização legal para emitir ou renovar o certificado.

3. Procuração Eletrônica para a Assessoria Contábil:
- Com o e-CNPJ ativo, a igreja assina digitalmente a Procuração Eletrônica da Receita Federal outorgando poderes ao CNPJ da Yeshua Contabilidade, permitindo que a assessoria cuide de toda a rotina fiscal sem necessidade de envio diário de tokens ou senhas.`,
    keyPoints: [
      'e-CNPJ A1 (em arquivo) é o formato recomendado para integração automatizada com o desk de atendimento.',
      'Não é possível emitir ou renovar certificado digital se a ata de posse estiver vencida.',
      'Procuração Eletrônica na RFB outorga poderes técnicos à contabilidade com total segurança jurídica.'
    ],
    operationalChecklist: [
      'Conferir a validade do e-CNPJ da igreja com pelo menos 30 dias de antecedência do vencimento.',
      'Assegurar que a ata de posse registrada em cartório esteja com vigência superior à data da validação.',
      'Emitir a Procuração Eletrônica no e-CAC para o CNPJ da assessoria contábil.',
      'Manter cópia de backup do certificado A1 em ambiente criptografado e seguro.'
    ],
    risksAndPenalties: [
      'Expirar o certificado com obrigações pendentes (eSocial/DCTFWeb), gerando multas imediatas por atraso.',
      'Impossibilidade de gerar guias de recolhimento de IRRF de prebendas a tempo hábil.'
    ],
    escalationTriggers: [
      'certificado digital expirado',
      'erro ao renovar certificado ata vencida',
      'impossibilidade de emitir e-cnpj'
    ],
    recommendedAction:
      'Checar regularidade da ata no RCPJ, agendar emissão por videoconferência do e-CNPJ A1 e configurar procuração eletrônica no portal e-CAC da Receita Federal.'
  }
};

/**
 * Funções utilitárias de recuperação e busca canônica na base eclesiástica
 */
export function getChurchKnowledgeTopic(topicKey: string): ChurchKnowledgeTopic | undefined {
  if (!topicKey) return undefined;
  const normalizedKey = topicKey.toUpperCase().trim();
  return CHURCH_KNOWLEDGE_BASE[normalizedKey];
}

export function getAllChurchTopics(): ChurchKnowledgeTopic[] {
  return Object.values(CHURCH_KNOWLEDGE_BASE);
}

export function searchChurchKnowledge(query: string): ChurchKnowledgeTopic[] {
  if (!query || !query.trim()) return [];
  const clean = query.toLowerCase().trim();

  return Object.values(CHURCH_KNOWLEDGE_BASE).filter((topic) => {
    const inTitle = topic.title.toLowerCase().includes(clean);
    const inSummary = topic.shortSummary.toLowerCase().includes(clean);
    const inContent = topic.detailedContent.toLowerCase().includes(clean);
    const inTriggers = topic.escalationTriggers.some((t) => t.toLowerCase().includes(clean) || clean.includes(t.toLowerCase()));
    const inKeyPoints = topic.keyPoints.some((k) => k.toLowerCase().includes(clean));
    return inTitle || inSummary || inContent || inTriggers || inKeyPoints;
  });
}
