import * as XLSX from 'xlsx';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';

export interface RawAttendeeRow {
  name: string;
  phone: string;
  eventName?: string;
  eventDate?: string;
  attended: boolean;
  notes?: string;
}

export interface ParsedAttendeeResult {
  validRows: Array<{
    name: string;
    rawPhone: string;
    normalizedPhone: string;
    attended: boolean;
    eventName?: string;
    eventDate?: string;
    notes?: string;
  }>;
  invalidRows: Array<{
    rowNumber: number;
    rawRow: any;
    error: string;
  }>;
  duplicatesCount: number;
  totalProcessed: number;
  totalPresent: number;
  totalAbsent: number;
}

export class SpreadsheetParser {
  /**
   * Converte arquivo CSV ou XLSX em lista estruturada e higienizada de presenças
   */
  public static parseBuffer(
    fileBuffer: Buffer,
    _filename?: string
  ): ParsedAttendeeResult {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const validRows: ParsedAttendeeResult['validRows'] = [];
    const invalidRows: ParsedAttendeeResult['invalidRows'] = [];
    const seenPhones = new Set<string>();
    let duplicatesCount = 0;
    let totalPresent = 0;
    let totalAbsent = 0;

    let rowNum = 1; // 1-indexed (considerando cabeçalho como linha 1)

    for (const raw of rawRows) {
      rowNum++;

      // Identifica colunas de forma flexível (case-insensitive e variações)
      const name = this.extractFieldValue(raw, ['nome', 'name', 'participante', 'contato', 'pessoa']);
      const phone = this.extractFieldValue(raw, ['telefone', 'phone', 'celular', 'whatsapp', 'fone', 'tel', 'numero']);
      const attendedVal = this.extractFieldValue(raw, ['participou', 'presente', 'presenca', 'attended', 'presença', 'compareceu']);
      const eventName = this.extractFieldValue(raw, ['evento', 'event', 'culto', 'encontro', 'reuniao', 'reunião']);
      const eventDate = this.extractFieldValue(raw, ['data', 'date', 'horario', 'horário', 'datetime']);
      const notes = this.extractFieldValue(raw, ['observacao', 'observação', 'notes', 'obs']);

      if (!name || name.trim().length === 0) {
        invalidRows.push({
          rowNumber: rowNum,
          rawRow: raw,
          error: 'Nome do participante ausente ou vazio'
        });
        continue;
      }

      if (!phone || phone.trim().length === 0) {
        invalidRows.push({
          rowNumber: rowNum,
          rawRow: raw,
          error: 'Telefone ausente ou vazio'
        });
        continue;
      }

      const phoneValidation = PhoneNumber.normalize(phone);
      if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
        invalidRows.push({
          rowNumber: rowNum,
          rawRow: raw,
          error: phoneValidation.error || 'Telefone inválido para formato brasileiro E.164'
        });
        continue;
      }

      const normalizedPhone = phoneValidation.normalizedPhone;

      // Normaliza o status de presença (sim/não, true/false, 1/0, s/n)
      const attended = this.parseAttendedBoolean(attendedVal);

      // Deduplicação dentro da mesma planilha
      if (seenPhones.has(normalizedPhone)) {
        duplicatesCount++;
        // Atualiza registro existente se este tiver status presente
        const existingIdx = validRows.findIndex(r => r.normalizedPhone === normalizedPhone);
        if (existingIdx >= 0 && attended) {
          validRows[existingIdx].attended = true;
        }
        continue;
      }

      seenPhones.add(normalizedPhone);

      if (attended) {
        totalPresent++;
      } else {
        totalAbsent++;
      }

      validRows.push({
        name: name.trim(),
        rawPhone: phone.trim(),
        normalizedPhone,
        attended,
        eventName: eventName ? eventName.trim() : undefined,
        eventDate: eventDate ? eventDate.trim() : undefined,
        notes: notes ? notes.trim() : undefined
      });
    }

    return {
      validRows,
      invalidRows,
      duplicatesCount,
      totalProcessed: rawRows.length,
      totalPresent,
      totalAbsent
    };
  }

  private static extractFieldValue(row: any, candidates: string[]): string {
    const rowKeys = Object.keys(row);
    for (const candidate of candidates) {
      const foundKey = rowKeys.find(k => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === candidate.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        return String(row[foundKey]).trim();
      }
    }
    return '';
  }

  private static parseAttendedBoolean(val: string): boolean {
    if (!val) return false;
    const clean = val.trim().toLowerCase();
    return (
      clean === 'sim' ||
      clean === 's' ||
      clean === 'true' ||
      clean === '1' ||
      clean === 'presente' ||
      clean === 'p' ||
      clean === 'yes' ||
      clean === 'y'
    );
  }
}
