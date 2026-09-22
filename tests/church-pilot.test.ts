import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import * as XLSX from 'xlsx';
import { prisma } from '../src/infrastructure/database/prisma.client.js';
import { buildApp } from '../src/presentation/server.js';
import {
  CHURCH_KNOWLEDGE_BASE,
  getChurchKnowledgeTopic,
  searchChurchKnowledge,
  getAllChurchTopics
} from '../src/application/verticals/accounting/church-knowledge-base.js';
import {
  ChurchAccountingCategory,
  CHURCH_ACCOUNTING_TAXONOMY
} from '../src/application/verticals/accounting/church-accounting-taxonomy.js';
import {
  AccountingAIPolicy,
  CHURCH_DISCLAIMER
} from '../src/application/verticals/accounting/accounting-ai-policy.js';
import { ChurchSpreadsheetParser } from '../src/infrastructure/parsers/church-spreadsheet.parser.js';
import { ImportChurchClientsUseCase } from '../src/application/use-cases/import-church-clients.use-case.js';
import { ProcessInboundMessageUseCase } from '../src/application/use-cases/process-inbound-message.use-case.js';
import { CompositeAIService } from '../src/infrastructure/ai/composite-ai.service.js';

describe('Suíte de Testes do Piloto de Igrejas (Yeshua Churches Pilot)', () => {
  let server: http.Server;
  let baseUrl: string;
  let churchOrgId: string;
  let userCookie: string;
  let inboundUseCase: ProcessInboundMessageUseCase;

  const parseCookieHeader = (res: any) => {
    if (typeof res.headers.getSetCookie === 'function') {
      const cookies = res.headers.getSetCookie();
      return cookies.map((c: string) => c.split(';')[0].trim()).join('; ');
    }
    const raw = res.headers.get('set-cookie') || '';
    return raw
      .split(',')
      .map((c: string) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  };

  beforeAll(async () => {
    const { app } = buildApp();
    inboundUseCase = new ProcessInboundMessageUseCase(new CompositeAIService());

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Cadastra usuário auditor/pastor de teste
    const userEmail = `yeshua-church-${Date.now()}@test.com`;
    const signupRes = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Pastor Auditor Yeshua',
        email: userEmail,
        password: 'Password123!'
      })
    });
    userCookie = parseCookieHeader(signupRes);

    // Cria Organização de Teste com perfil de Igrejas (CHURCH)
    const churchOrg = await prisma.organization.create({
      data: {
        name: 'Yeshua Igrejas & Terceiro Setor',
        slug: `yeshua-church-${Date.now()}`,
        metadata: JSON.stringify({
          verticalProfile: 'CHURCH',
          brandName: 'YESHUA IGREJAS DESK',
          brandSubtitle: 'Assessoria Contábil e Jurídica Eclesiástica'
        }),
        members: {
          create: {
            userId: (await prisma.user.findUnique({ where: { email: userEmail } }))!.id,
            role: 'OWNER'
          }
        },
        settings: {
          create: { timezone: 'America/Sao_Paulo', language: 'pt-BR', aiProvider: 'LOCAL_FALLBACK' }
        },
        whatsAppConnection: {
          create: { isMock: true, status: 'CONNECTED' }
        }
      }
    });
    churchOrgId = churchOrg.id;
  }, 90000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));

    try {
      if (churchOrgId) {
        await prisma.followUpTask.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.aIAnalysis.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.message.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.conversation.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.person.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.attendance.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.campaign.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.event.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.organizationSettings.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.whatsAppConnection.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.member.deleteMany({ where: { organizationId: churchOrgId } });
        await prisma.organization.delete({ where: { id: churchOrgId } }).catch(() => {});
      }
    } catch {
      // Ignora erros de teardown
    }
  });

  // =========================================================================
  // 1. BASE DE CONHECIMENTO CANÔNICA DE IGREJAS E TERCEIRO SETOR
  // =========================================================================
  describe('1. Base de Conhecimento Eclesiástica & Terceiro Setor', () => {
    it('deve conter tópicos canônicos fundamentados sobre legislação brasileira de igrejas', () => {
      const allTopics = getAllChurchTopics();
      expect(allTopics.length).toBeGreaterThanOrEqual(7);

      // Imunidade Tributária (Art. 150, VI, b da CF/88, EC 116/2022, Art. 14 CTN)
      const imunidade = getChurchKnowledgeTopic('IMUNIDADE_TRIBUTARIA');
      expect(imunidade).toBeDefined();
      expect(imunidade!.detailedContent).toContain('Art. 150, VI, \'b\'');
      expect(imunidade!.detailedContent).toContain('EC 116/2022');
      expect(imunidade!.detailedContent).toContain('IPTU');
      expect(imunidade!.detailedContent).toContain('Art. 14 do CTN');

      // Prebenda Pastoral (eSocial 701, sem FGTS, INSS individual, IRRF)
      const prebenda = getChurchKnowledgeTopic('PREBENDA_PASTORAL');
      expect(prebenda).toBeDefined();
      expect(prebenda!.detailedContent).toContain('Categoria 701');
      expect(prebenda!.detailedContent).toContain('Não incidência absoluta de FGTS');
      expect(prebenda!.detailedContent).toContain('Contribuinte Individual');
      expect(prebenda!.detailedContent).toContain('Tabela Progressiva Mensal');
      expect(prebenda!.detailedContent).toContain('14.647/2023');

      // Obrigações Acessórias (ECF, ECD, DCTFWeb, EFD-Reinf, eSocial)
      const obrigacoes = getChurchKnowledgeTopic('OBRIGACOES_ACESSORIAS');
      expect(obrigacoes).toBeDefined();
      expect(obrigacoes!.detailedContent).toContain('ECF');
      expect(obrigacoes!.detailedContent).toContain('DCTFWeb');
      expect(obrigacoes!.detailedContent).toContain('EFD-Reinf');

      // Regularidade Cartorial e Estatutária (RCPJ, DBE, Mandato e Bloqueio Bancário)
      const estatuto = getChurchKnowledgeTopic('REGULARIDADE_ESTATUTO_ATA');
      expect(estatuto).toBeDefined();
      expect(estatuto!.detailedContent).toContain('RCPJ');
      expect(estatuto!.detailedContent).toContain('DBE');
      expect(estatuto!.detailedContent).toContain('Bloqueio Bancário');

      // Certidões Negativas (CND RFB/PGFN, CRF FGTS, CADIN)
      const certidoes = getChurchKnowledgeTopic('CERTIDOES_CND');
      expect(certidoes).toBeDefined();
      expect(certidoes!.detailedContent).toContain('CND Conjunta da Receita Federal e PGFN');
      expect(certidoes!.detailedContent).toContain('CRF do FGTS');
      expect(certidoes!.detailedContent).toContain('CADIN Federal');

      // Termo de Voluntariado (Lei 9.608/1998, equipe de louvor e recepção)
      const voluntariado = getChurchKnowledgeTopic('VOLUNTARIADO_LEI_9608');
      expect(voluntariado).toBeDefined();
      expect(voluntariado!.detailedContent).toContain('Lei Federal nº 9.608/1998');
      expect(voluntariado!.detailedContent).toContain('equipe de louvor');
      expect(voluntariado!.detailedContent).toContain('vínculo empregatício');

      // Segregação Patrimonial & Dízimos
      const dizimos = getChurchKnowledgeTopic('DOACOES_DIZIMOS');
      expect(dizimos).toBeDefined();
      expect(dizimos!.detailedContent).toContain('Segregação Patrimonial');
      expect(dizimos!.detailedContent).toContain('PIX oficial com a chave do CNPJ');
    });

    it('deve permitir busca por palavras-chave na base de conhecimento', () => {
      const resultsPrebenda = searchChurchKnowledge('eSocial 701');
      expect(resultsPrebenda.length).toBeGreaterThanOrEqual(1);
      expect(resultsPrebenda[0].id).toBe('PREBENDA_PASTORAL');

      const resultsIptu = searchChurchKnowledge('EC 116/2022');
      expect(resultsIptu.length).toBeGreaterThanOrEqual(1);
      expect(resultsIptu[0].id).toBe('IMUNIDADE_TRIBUTARIA');
    });
  });

  // =========================================================================
  // 2. TAXONOMIA E MOTOR DE DECISÃO / IA SEGURA COM DISCLAIMER
  // =========================================================================
  describe('2. Taxonomia Eclesiástica & Motor de IA Segura', () => {
    it('deve conter as 11 categorias canônicas definidas na taxonomia', () => {
      const expectedCategories: ChurchAccountingCategory[] = [
        'IMUNIDADE_TRIBUTARIA',
        'PREBENDA_PASTORAL',
        'OBRIGACOES_ACESSORIAS',
        'REGULARIDADE_ESTATUTO_ATA',
        'CERTIDOES_CND',
        'VOLUNTARIADO_LEI_9608',
        'DOACOES_DIZIMOS',
        'CERTIFICADO_DIGITAL',
        'CASO_COMPLEXO_FISCALIZACAO',
        'FALAR_ESPECIALISTA',
        'GERAL_ECLESIASTICO'
      ];

      for (const cat of expectedCategories) {
        expect(CHURCH_ACCOUNTING_TAXONOMY[cat]).toBeDefined();
        expect(CHURCH_ACCOUNTING_TAXONOMY[cat].label).toBeTruthy();
        expect(CHURCH_ACCOUNTING_TAXONOMY[cat].suggestedAction).toBeTruthy();
      }
    });

    it('deve classificar dúvidas de igrejas e anexar o disclaimer institucional obrigatório', () => {
      // Cenário: Prebenda e eSocial 701
      const resPrebenda = AccountingAIPolicy.analyzeChurch(
        'Como funciona o pagamento da prebenda pastoral no eSocial categoria 701? A igreja precisa pagar FGTS ou INSS patronal?',
        { clientName: 'Pr. Josué', churchName: 'Igreja Batista Central' }
      );
      expect(resPrebenda.category).toBe('PREBENDA_PASTORAL');
      expect(resPrebenda.priority).toBe('HIGH');
      expect(resPrebenda.suggestedReply).toContain('Categoria 701');
      expect(resPrebenda.suggestedReply).toContain('isenção absoluta de FGTS');
      expect(resPrebenda.suggestedReply).toContain(CHURCH_DISCLAIMER.trim());

      // Cenário: Voluntários de louvor e Lei 9.608/1998
      const resVoluntario = AccountingAIPolicy.analyzeChurch(
        'Temos músicos e voluntários na equipe de louvor e recepção do culto. Qual o termo de adesão segundo a Lei 9.608/1998 para evitar passivos trabalhistas?',
        { clientName: 'Pr. Samuel', churchName: 'Comunidade da Fé' }
      );
      expect(resVoluntario.category).toBe('VOLUNTARIADO_LEI_9608');
      expect(resVoluntario.priority).toBe('MEDIUM');
      expect(resVoluntario.suggestedReply).toContain('Lei Federal nº 9.608/1998');
      expect(resVoluntario.suggestedReply).toContain(CHURCH_DISCLAIMER.trim());

      // Cenário: Imunidade de IPTU de imóvel alugado (EC 116/2022)
      const resImunidade = AccountingAIPolicy.analyzeChurch(
        'A prefeitura está cobrando IPTU do galpão alugado onde realizamos nossos cultos. Pela Emenda Constitucional 116 e Artigo 150 temos imunidade tributária?',
        { clientName: 'Tesoureiro Marcos', churchName: 'Igreja Evangélica Renovada' }
      );
      expect(resImunidade.category).toBe('IMUNIDADE_TRIBUTARIA');
      expect(resImunidade.priority).toBe('HIGH');
      expect(resImunidade.suggestedReply).toContain('EC 116/2022');
      expect(resImunidade.suggestedReply).toContain(CHURCH_DISCLAIMER.trim());

      // Cenário: Dízimos e segregação de conta bancária
      const resDizimos = AccountingAIPolicy.analyzeChurch(
        'O pastor pode receber ofertas e dízimos da igreja no PIX pessoal dele ou é obrigatória a segregação patrimonial na conta da igreja?',
        { clientName: 'Líder André', churchName: 'Ministério Vida' }
      );
      expect(resDizimos.category).toBe('DOACOES_DIZIMOS');
      expect(resDizimos.suggestedReply).toContain('PIX do CNPJ da igreja');
      expect(resDizimos.suggestedReply).toContain(CHURCH_DISCLAIMER.trim());
    });

    // =======================================================================
    // 3. SAFETY GATE DE ESCALONAMENTO MANDATÓRIO POR EXCEÇÃO
    // =======================================================================
    describe('3. Safety Gate de Escalonamento Mandatório', () => {
      it('deve disparar prioridade URGENT, requiresHumanAttention e ESCALATE_TO_SENIOR_AUDITOR para notificação fiscal da Receita/PGFN', () => {
        const textReceita =
          'URGENTE: Recebemos uma notificação fiscal da Receita Federal cobrando R$ 48.000,00 de multa por omissão de ECF dos últimos 3 anos com prazo de 15 dias para defesa!';

        const res = AccountingAIPolicy.analyzeChurch(textReceita, {
          clientName: 'Pr. Carlos',
          churchName: 'Igreja Avivamento Pleno'
        });

        expect(res.category).toBe('CASO_COMPLEXO_FISCALIZACAO');
        expect(res.priority).toBe('URGENT');
        expect(res.urgency).toBe('CRITICA');
        expect(res.sentiment).toBe('CRITICO');
        expect(res.requiresAttention).toBe(true);
        expect(res.requiresHumanAttention).toBe(true);
        expect(res.isEscalation).toBe(true);
        expect(res.nextAction).toBe('ESCALATE_TO_SENIOR_AUDITOR');
        expect(res.suggestedReply).toContain('prioridade MÁXIMA');
        expect(res.suggestedReply).toContain('escalado imediatamente para a assessoria contábil e jurídica sênior');
        expect(res.suggestedReply).toContain(CHURCH_DISCLAIMER.trim());
      });

      it('deve disparar prioridade URGENT para bloqueio de contas bancárias por mandato vencido', () => {
        const textBloqueio =
          'O Banco do Brasil bloqueou a conta bancária e o PIX da igreja hoje cedo alegando que a ata de posse da diretoria está com mandato vencido!';

        const res = AccountingAIPolicy.analyzeChurch(textBloqueio, {
          clientName: 'Tesoureiro Daniel',
          churchName: 'Igreja Presbiteriana Unida'
        });

        expect(res.category).toBe('CASO_COMPLEXO_FISCALIZACAO');
        expect(res.priority).toBe('URGENT');
        expect(res.requiresAttention).toBe(true);
        expect(res.isEscalation).toBe(true);
        expect(res.nextAction).toBe('ESCALATE_TO_SENIOR_AUDITOR');
      });

      it('deve disparar prioridade URGENT para intimação da PGFN com inscrição em dívida ativa', () => {
        const textPgfn =
          'Chegou uma intimação da PGFN com inscrição em dívida ativa da União referente a contribuições previdenciárias não declaradas na DCTFWeb.';

        const res = AccountingAIPolicy.analyzeChurch(textPgfn);

        expect(res.priority).toBe('URGENT');
        expect(res.isEscalation).toBe(true);
        expect(res.nextAction).toBe('ESCALATE_TO_SENIOR_AUDITOR');
      });
    });
  });

  // =========================================================================
  // 4. PARSER DE PLANILHA DE IGREJAS (CSV / XLSX)
  // =========================================================================
  describe('4. Parser de Planilha de Igrejas (ChurchSpreadsheetParser)', () => {
    it('deve processar planilha XLSX com colunas oficiais, normalizar WhatsApp E.164 e deduplicar', () => {
      const rows = [
        {
          'Nome da Igreja/Entidade': 'Igreja Batista Boas Novas',
          CNPJ: '12.345.678/0001-90',
          'Pastor/Responsável': 'Pr. Samuel Silva',
          WhatsApp: '11991234567',
          'E-mail': 'contato@boasnovas.org.br',
          'Cidade/UF': 'São Paulo/SP',
          Denominação: 'Convenção Batista Brasileira'
        },
        {
          'Nome da Igreja/Entidade': 'Comunidade Cristã Vida & Paz',
          CNPJ: '98.765.432/0001-10',
          'Pastor/Responsável': 'Apóstolo Roberto',
          WhatsApp: '+55 21 98877-6655',
          'E-mail': 'financeiro@vidapaz.com',
          'Cidade/UF': 'Rio de Janeiro/RJ',
          Denominação: 'Pentecostal Independente'
        },
        // Linha duplicada (mesmo WhatsApp)
        {
          'Nome da Igreja/Entidade': 'Igreja Batista Boas Novas - Filial',
          CNPJ: '12.345.678/0002-71',
          'Pastor/Responsável': 'Pr. Samuel Silva',
          WhatsApp: '(11) 99123-4567',
          'Cidade/UF': 'São Paulo/SP'
        },
        // Linha com telefone inválido
        {
          'Nome da Igreja/Entidade': 'Igreja Sem Telefone Válido',
          'Pastor/Responsável': 'Pr. Nulo',
          WhatsApp: '12345'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Igrejas');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const result = ChurchSpreadsheetParser.parseBuffer(buffer, 'igrejas.xlsx');

      expect(result.totalProcessed).toBe(4);
      expect(result.validRows.length).toBe(2);
      expect(result.duplicatesCount).toBe(1);
      expect(result.invalidRows.length).toBe(1);

      // Validação da primeira linha normalizada
      const first = result.validRows[0];
      expect(first.churchName).toBe('Igreja Batista Boas Novas');
      expect(first.normalizedPhone).toBe('+5511991234567');
      expect(first.cnpj).toBe('12.345.678/0001-90');
      expect(first.cnpjDigits).toBe('12345678000190');
      expect(first.pastorName).toBe('Pr. Samuel Silva');
      expect(first.denomination).toBe('Convenção Batista Brasileira');

      // Validação da segunda linha normalizada
      const second = result.validRows[1];
      expect(second.churchName).toBe('Comunidade Cristã Vida & Paz');
      expect(second.normalizedPhone).toBe('+5521988776655');
      expect(second.cnpj).toBe('98.765.432/0001-10');
    });
  });

  // =========================================================================
  // 5. CASO DE USO DE IMPORTAÇÃO ATÔMICA & DEDUPLICAÇÃO NO BANCO
  // =========================================================================
  describe('5. ImportChurchClientsUseCase (Banco de Dados & Idempotência)', () => {
    it('deve importar igrejas atomicamente, salvar metadados em Person.notes e deduplicar em nova execução', async () => {
      const rows = [
        {
          'Nome da Igreja/Entidade': 'Assembleia de Deus Ministério Esperança',
          CNPJ: '11.222.333/0001-44',
          'Pastor/Responsável': 'Pr. Elias Nascimento',
          WhatsApp: '11977771122',
          'E-mail': 'tesouraria@ad-esperanca.com.br',
          'Cidade/UF': 'Campinas/SP',
          Denominação: 'Assembleia de Deus'
        },
        {
          'Nome da Igreja/Entidade': 'Igreja Presbiteriana Central',
          CNPJ: '22.333.444/0001-55',
          'Pastor/Responsável': 'Rev. Lucas Ferreira',
          WhatsApp: '11977773344',
          'E-mail': 'contato@ipbcentral.com.br',
          'Cidade/UF': 'Santos/SP',
          Denominação: 'IPB'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Igrejas');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const useCase = new ImportChurchClientsUseCase();

      // 1ª Execução: Importação inicial
      const res1 = await useCase.execute({
        organizationId: churchOrgId,
        fileBuffer: buffer,
        filename: 'igrejas-piloto.xlsx'
      });

      expect(res1.totalRows).toBe(2);
      expect(res1.totalImported).toBe(2);
      expect(res1.totalUpdated).toBe(0);

      // Valida persistência no banco de dados e metadados estruturados em Person.notes
      const person1 = await prisma.person.findUnique({
        where: {
          organizationId_normalizedPhone: {
            organizationId: churchOrgId,
            normalizedPhone: '+5511977771122'
          }
        }
      });
      expect(person1).toBeTruthy();
      expect(person1!.name).toContain('Assembleia de Deus');
      expect(person1!.name).toContain('Pr. Elias Nascimento');
      expect(person1!.notes).toBeTruthy();

      const notes = JSON.parse(person1!.notes!);
      expect(notes.isChurch).toBe(true);
      expect(notes.cnpj).toBe('11.222.333/0001-44');
      expect(notes.churchName).toBe('Assembleia de Deus Ministério Esperança');
      expect(notes.denomination).toBe('Assembleia de Deus');
      expect(notes.cityUf).toBe('Campinas/SP');

      // 2ª Execução: Deduplicação idempotente (não duplica clientes, atualiza metadados)
      const res2 = await useCase.execute({
        organizationId: churchOrgId,
        fileBuffer: buffer,
        filename: 'igrejas-piloto.xlsx'
      });

      expect(res2.totalImported).toBe(0);
      expect(res2.totalUpdated).toBe(2);

      // Quantidade total de pessoas deve permanecer exatamente 2
      const totalChurches = await prisma.person.count({
        where: { organizationId: churchOrgId }
      });
      expect(totalChurches).toBe(2);
    });
  });

  // =========================================================================
  // 6. ENDPOINT HTTP: POST /api/persons/import-churches
  // =========================================================================
  describe('6. Endpoint HTTP: POST /api/persons/import-churches', () => {
    it('deve realizar upload de planilha multipart/form-data com autenticação e isolamento de tenant', async () => {
      const rows = [
        {
          'Nome da Igreja/Entidade': 'Igreja Metodista Betel',
          CNPJ: '33.444.555/0001-66',
          'Pastor/Responsável': 'Bispa Marta Regina',
          WhatsApp: '11977775566',
          'E-mail': 'bispa@metodistabetel.org',
          'Cidade/UF': 'São Paulo/SP',
          Denominação: 'Metodista'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Igrejas');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Cria multipart payload
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="igreja-upload.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;

      const multipartBody = Buffer.concat([
        Buffer.from(header, 'utf-8'),
        buffer,
        Buffer.from(footer, 'utf-8')
      ]);

      const res = await fetch(`${baseUrl}/api/persons/import-churches`, {
        method: 'POST',
        headers: {
          cookie: userCookie,
          'x-organization-id': churchOrgId,
          'content-type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.totalProcessed).toBe(1);
      expect(body.totalImported).toBe(1);

      // Confirma criação no banco
      const person = await prisma.person.findUnique({
        where: {
          organizationId_normalizedPhone: {
            organizationId: churchOrgId,
            normalizedPhone: '+5511977775566'
          }
        }
      });
      expect(person).toBeTruthy();
      expect(person!.name).toContain('Igreja Metodista Betel');
    });
  });

  // =========================================================================
  // 7. FLUXO END-TO-END: MENSAGEM INBOUND COM ESCALONAMENTO E CRIAÇÃO DE TASK
  // =========================================================================
  describe('7. Fluxo Inbound E2E: Escalonamento para Auditor Sênior', () => {
    it('deve processar mensagem de notificação fiscal de pastor importado, disparar URGENT e criar FollowUpTask', async () => {
      const pastorPhone = '+5511977771122'; // Pastor Elias Nascimento importado anteriormente
      const msgText =
        'A paz do Senhor! Acabamos de receber uma notificação da Receita Federal intimando a igreja sobre inconsistências na DCTFWeb e EFD-Reinf com prazo de 10 dias úteis e ameaça de multa de 75%. O que devemos fazer com urgência?';

      const result = await inboundUseCase.execute({
        organizationId: churchOrgId,
        fromPhone: pastorPhone,
        text: msgText
      });

      expect(result.classification).toBeDefined();
      expect(result.classification!.category).toBe('CASO_COMPLEXO_FISCALIZACAO');
      expect(result.classification!.priority).toBe('URGENT');
      expect(result.classification!.urgency).toBe('CRITICA');
      expect(result.classification!.sentiment).toBe('CRITICO');
      expect(result.classification!.nextAction).toBe('ESCALATE_TO_SENIOR_AUDITOR');
      expect(result.classification!.requiresHumanAttention).toBe(true);
      expect(result.classification!.suggestedReply).toContain(CHURCH_DISCLAIMER.trim());
      expect(result.followUpTaskId).toBeDefined();

      // Validação da Tarefa de Acompanhamento (FollowUpTask) criada no banco de dados
      const task = await prisma.followUpTask.findUnique({
        where: { id: result.followUpTaskId! }
      });
      expect(task).toBeTruthy();
      expect(task!.priority).toBe('URGENT');
      expect(task!.status).toBe('PENDING');
      expect(task!.title).toContain('Pendência Eclesiástica');
      expect(task!.title).toContain('Notificação Fiscal / Multa');
      expect(task!.description).toContain('Escalar imediatamente para auditor contábil sênior');

      // Validação da Análise de IA persistida
      const aiAnalysis = await prisma.aIAnalysis.findFirst({
        where: { messageId: result.messageId }
      });
      expect(aiAnalysis).toBeTruthy();
      expect(aiAnalysis!.modelUsed).toBe('YESHUA_CHURCH_AI');
      expect(aiAnalysis!.category).toBe('CASO_COMPLEXO_FISCALIZACAO');
      expect(aiAnalysis!.priority).toBe('URGENT');
      expect(aiAnalysis!.requiresHumanAttention).toBe(true);

      // Validação de atualização de estado da conversa
      const conversation = await prisma.conversation.findUnique({
        where: { id: result.conversationId }
      });
      expect(conversation).toBeTruthy();
      expect(conversation!.priority).toBe('URGENT');
      expect(conversation!.requiresHumanAttention).toBe(true);
    });
  });
});
