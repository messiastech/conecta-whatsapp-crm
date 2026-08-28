import { prisma } from '../../infrastructure/database/prisma.client.js';
import { SpreadsheetParser, ParsedAttendeeResult } from '../../infrastructure/parsers/spreadsheet.parser.js';

export interface ImportAttendanceDTO {
  eventId: string;
  fileBuffer: Buffer;
  filename?: string;
}

export interface ImportAttendanceResult {
  eventId: string;
  eventName: string;
  totalRows: number;
  totalImported: number;
  totalPresent: number;
  totalAbsent: number;
  duplicatesIgnored: number;
  invalidRows: ParsedAttendeeResult['invalidRows'];
}

export class ImportAttendanceUseCase {
  async execute(dto: ImportAttendanceDTO): Promise<ImportAttendanceResult> {
    const event = await prisma.event.findUnique({
      where: { id: dto.eventId }
    });

    if (!event) {
      throw new Error(`Evento com ID ${dto.eventId} não encontrado`);
    }

    const parsed = SpreadsheetParser.parseBuffer(dto.fileBuffer, dto.filename);

    let importedCount = 0;
    let presentCount = 0;
    let absentCount = 0;

    for (const row of parsed.validRows) {
      // 1. Upsert da Pessoa (mantém o optOut e consentStatus prévios se já existirem)
      const person = await prisma.person.upsert({
        where: { normalizedPhone: row.normalizedPhone },
        update: {
          name: row.name,
          phone: row.rawPhone,
          notes: row.notes || undefined
        },
        create: {
          name: row.name,
          phone: row.rawPhone,
          normalizedPhone: row.normalizedPhone,
          notes: row.notes,
          optOut: false,
          consentStatus: 'OPTED_IN',
          consentSource: 'SPREADSHEET_IMPORT'
        }
      });

      // 2. Upsert da Presença no Evento (com status explícito e universo convidado)
      const attendanceStatus = row.attended ? 'ATTENDED' : 'ABSENT';

      await prisma.attendance.upsert({
        where: {
          personId_eventId: {
            personId: person.id,
            eventId: event.id
          }
        },
        update: {
          attended: row.attended,
          status: attendanceStatus,
          invited: true,
          notes: row.notes || undefined
        },
        create: {
          personId: person.id,
          eventId: event.id,
          invited: true,
          confirmed: true,
          attended: row.attended,
          status: attendanceStatus,
          notes: row.notes,
          source: 'CSV_IMPORT'
        }
      });

      importedCount++;
      if (row.attended) {
        presentCount++;
      } else {
        absentCount++;
      }
    }

    // 3. Atualiza os contadores agregados no Evento (Single Source of Truth)
    await prisma.event.update({
      where: { id: event.id },
      data: {
        totalAttendees: presentCount,
        totalAbsentees: absentCount,
        status: 'COMPLETED'
      }
    });

    // 4. Log de Auditoria
    await prisma.auditLog.create({
      data: {
        action: 'ATTENDANCE_IMPORTED',
        entityType: 'Event',
        entityId: event.id,
        details: JSON.stringify({
          eventName: event.name,
          imported: importedCount,
          present: presentCount,
          absent: absentCount,
          duplicates: parsed.duplicatesCount,
          invalid: parsed.invalidRows.length
        })
      }
    });

    return {
      eventId: event.id,
      eventName: event.name,
      totalRows: parsed.totalProcessed,
      totalImported: importedCount,
      totalPresent: presentCount,
      totalAbsent: absentCount,
      duplicatesIgnored: parsed.duplicatesCount,
      invalidRows: parsed.invalidRows
    };
  }
}
