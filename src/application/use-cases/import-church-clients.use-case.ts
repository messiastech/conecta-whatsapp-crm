import { prisma } from '../../infrastructure/database/prisma.client.js';
import {
  ChurchSpreadsheetParser,
  ParsedChurchSpreadsheetResult
} from '../../infrastructure/parsers/church-spreadsheet.parser.js';

export interface ImportChurchClientsDTO {
  organizationId: string;
  fileBuffer: Buffer;
  filename?: string;
}

export interface ChurchMetadataNotes {
  isChurch: true;
  churchName: string;
  companyName: string;
  pastorName: string;
  clientName: string;
  cnpj?: string;
  cnpjDigits?: string;
  cityUf?: string;
  denomination?: string;
  importSource: 'CHURCH_SPREADSHEET_IMPORT';
  importedAt: string;
  lastUpdatedAt?: string;
}

export interface ImportChurchClientsResult {
  totalRows: number;
  totalProcessed: number;
  totalImported: number;
  totalUpdated: number;
  duplicatesIgnored: number;
  invalidRows: ParsedChurchSpreadsheetResult['invalidRows'];
  importedChurches: Array<{
    id: string;
    name: string;
    normalizedPhone: string;
    cnpj?: string;
    isUpdate: boolean;
  }>;
}

export class ImportChurchClientsUseCase {
  /**
   * Executa a importação atômica e deduplicada de planilhas de igrejas, pastores e lideranças
   */
  async execute(dto: ImportChurchClientsDTO): Promise<ImportChurchClientsResult> {
    const org = await prisma.organization.findUnique({
      where: { id: dto.organizationId }
    });

    if (!org) {
      throw new Error(`Organização com ID ${dto.organizationId} não encontrada.`);
    }

    const parsed = ChurchSpreadsheetParser.parseBuffer(dto.fileBuffer, dto.filename);

    let totalImported = 0;
    let totalUpdated = 0;
    const importedChurches: ImportChurchClientsResult['importedChurches'] = [];

    // Execução atômica e sequencial de cada linha validada
    for (const row of parsed.validRows) {
      // 1. Deduplicação: primeiro tenta localizar pelo normalizedPhone dentro do tenant
      let existingPerson = await prisma.person.findUnique({
        where: {
          organizationId_normalizedPhone: {
            organizationId: dto.organizationId,
            normalizedPhone: row.normalizedPhone
          }
        }
      });

      // 2. Se não encontrou por telefone e a linha possui CNPJ, busca por CNPJ nos metadados
      if (!existingPerson && row.cnpjDigits) {
        const candidateByCnpj = await prisma.person.findFirst({
          where: {
            organizationId: dto.organizationId,
            notes: {
              contains: row.cnpjDigits
            }
          }
        });
        if (candidateByCnpj) {
          existingPerson = candidateByCnpj;
        }
      }

      const compositeName = row.pastorName
        ? `${row.pastorName} (${row.churchName})`
        : row.churchName;

      if (existingPerson) {
        // Atualiza o cadastro existente mesclando os metadados estruturados
        let existingNotes: Partial<ChurchMetadataNotes> = {};
        if (existingPerson.notes) {
          try {
            existingNotes = JSON.parse(existingPerson.notes);
          } catch {
            // Se notas anteriores eram texto simples, preserva
          }
        }

        const mergedNotes: ChurchMetadataNotes = {
          isChurch: true,
          churchName: row.churchName || existingNotes.churchName || existingPerson.name,
          companyName: row.churchName || existingNotes.companyName || existingPerson.name,
          pastorName: row.pastorName || existingNotes.pastorName || 'Pastor Responsável',
          clientName: row.pastorName || existingNotes.clientName || 'Pastor Responsável',
          cnpj: row.cnpj || existingNotes.cnpj,
          cnpjDigits: row.cnpjDigits || existingNotes.cnpjDigits,
          cityUf: row.cityUf || existingNotes.cityUf,
          denomination: row.denomination || existingNotes.denomination,
          importSource: 'CHURCH_SPREADSHEET_IMPORT',
          importedAt: existingNotes.importedAt || new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString()
        };

        const updated = await prisma.person.update({
          where: { id: existingPerson.id },
          data: {
            name: compositeName,
            email: row.email || existingPerson.email || undefined,
            notes: JSON.stringify(mergedNotes)
          }
        });

        totalUpdated++;
        importedChurches.push({
          id: updated.id,
          name: updated.name,
          normalizedPhone: updated.normalizedPhone,
          cnpj: row.cnpj,
          isUpdate: true
        });
      } else {
        // Criação de nova entidade no CRM
        const churchNotes: ChurchMetadataNotes = {
          isChurch: true,
          churchName: row.churchName,
          companyName: row.churchName,
          pastorName: row.pastorName,
          clientName: row.pastorName,
          cnpj: row.cnpj,
          cnpjDigits: row.cnpjDigits,
          cityUf: row.cityUf,
          denomination: row.denomination,
          importSource: 'CHURCH_SPREADSHEET_IMPORT',
          importedAt: new Date().toISOString()
        };

        const created = await prisma.person.create({
          data: {
            organizationId: dto.organizationId,
            name: compositeName,
            phone: row.rawPhone,
            normalizedPhone: row.normalizedPhone,
            email: row.email || null,
            notes: JSON.stringify(churchNotes),
            optOut: false,
            consentStatus: 'OPTED_IN',
            consentSource: 'CHURCH_SPREADSHEET_IMPORT'
          }
        });

        totalImported++;
        importedChurches.push({
          id: created.id,
          name: created.name,
          normalizedPhone: created.normalizedPhone,
          cnpj: row.cnpj,
          isUpdate: false
        });
      }
    }

    // Registro formal em AuditLog
    await prisma.auditLog.create({
      data: {
        organizationId: dto.organizationId,
        action: 'CHURCH_CLIENTS_IMPORTED',
        entityType: 'Person',
        details: JSON.stringify({
          totalProcessed: parsed.totalProcessed,
          totalImported,
          totalUpdated,
          duplicatesIgnored: parsed.duplicatesCount,
          invalidRowsCount: parsed.invalidRows.length
        })
      }
    });

    return {
      totalRows: parsed.totalProcessed,
      totalProcessed: parsed.totalProcessed,
      totalImported,
      totalUpdated,
      duplicatesIgnored: parsed.duplicatesCount,
      invalidRows: parsed.invalidRows,
      importedChurches
    };
  }
}
