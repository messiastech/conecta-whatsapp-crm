import * as XLSX from 'xlsx';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';

export interface ValidChurchRow {
  churchName: string;
  cnpj?: string;
  cnpjDigits?: string;
  pastorName: string;
  rawPhone: string;
  normalizedPhone: string;
  email?: string;
  cityUf?: string;
  denomination?: string;
}

export interface InvalidChurchRow {
  rowNumber: number;
  rawRow: any;
  error: string;
}

export interface ParsedChurchSpreadsheetResult {
  validRows: ValidChurchRow[];
  invalidRows: InvalidChurchRow[];
  duplicatesCount: number;
  totalProcessed: number;
}

export class ChurchSpreadsheetParser {
  /**
   * Converte arquivo CSV ou XLSX em lista estruturada e validada de Igrejas, Pastores e Tesoureiros
   */
  public static parseBuffer(fileBuffer: Buffer, _filename?: string): ParsedChurchSpreadsheetResult {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const validRows: ValidChurchRow[] = [];
    const invalidRows: InvalidChurchRow[] = [];
    const seenPhones = new Set<string>();
    const seenCnpjs = new Set<string>();
    let duplicatesCount = 0;

    let rowNum = 1; // 1-indexed (considerando cabeçalho como linha 1)

    for (const raw of rawRows) {
      rowNum++;

      // Extração resiliente de colunas com suporte a variações, acentos e espaços
      const churchName = this.extractFieldValue(raw, [
        'nomedaigrejaentidade',
        'nomedaigreja',
        'igrejaentidade',
        'igreja',
        'entidade',
        'razaosocial',
        'nomefantasia',
        'comunidade',
        'ministerio',
        'templo',
        'instituicao',
        'churchname',
        'church',
        'nome'
      ]);

      const cnpjRaw = this.extractFieldValue(raw, [
        'cnpj',
        'documento',
        'cgc',
        'cnpjdaentidade',
        'cnpjigreja'
      ]);

      const pastorName = this.extractFieldValue(raw, [
        'pastorresponsavel',
        'pastor',
        'responsavel',
        'pastorpresidente',
        'lider',
        'lideranca',
        'tesoureiro',
        'presidente',
        'pastorlider',
        'contato',
        'nomedopastor'
      ]);

      const phoneRaw = this.extractFieldValue(raw, [
        'whatsapp',
        'telefone',
        'celular',
        'fone',
        'tel',
        'zap',
        'phone',
        'whatsappresponsavel',
        'contatowhatsapp'
      ]);

      const emailRaw = this.extractFieldValue(raw, [
        'email',
        'emailresponsavel',
        'emailigreja',
        'correioeletronico',
        'mail'
      ]);

      const cityUf = this.extractFieldValue(raw, [
        'cidadeuf',
        'cidade',
        'municipio',
        'cidadeestado',
        'uf',
        'localidade',
        'cidadeeuf'
      ]);

      const denomination = this.extractFieldValue(raw, [
        'denominacao',
        'ramo',
        'convencao',
        'tipodeigreja',
        'ministeriodenominacao',
        'denomination'
      ]);

      // Validação mandatória: Nome da Igreja OU Nome do Pastor
      const resolvedChurchName = churchName.trim() || (pastorName ? `Ministério ${pastorName.trim()}` : '');
      const resolvedPastorName = pastorName.trim() || 'Pastor(a) / Responsável';

      if (!resolvedChurchName && !pastorName.trim()) {
        invalidRows.push({
          rowNumber: rowNum,
          rawRow: raw,
          error: 'Identificação da Igreja ou Pastor ausente na linha'
        });
        continue;
      }

      // Validação mandatória de Telefone / WhatsApp
      if (!phoneRaw || phoneRaw.trim().length === 0) {
        invalidRows.push({
          rowNumber: rowNum,
          rawRow: raw,
          error: 'WhatsApp ou telefone ausente'
        });
        continue;
      }

      const phoneValidation = PhoneNumber.normalize(phoneRaw);
      if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
        invalidRows.push({
          rowNumber: rowNum,
          rawRow: raw,
          error: phoneValidation.error || 'Telefone inválido para formato E.164 brasileiro'
        });
        continue;
      }

      const normalizedPhone = phoneValidation.normalizedPhone;

      // Higienização e Formatação de CNPJ
      let formattedCnpj: string | undefined;
      let cnpjDigits: string | undefined;

      if (cnpjRaw) {
        const cleanCnpj = cnpjRaw.replace(/\D/g, '');
        if (cleanCnpj.length === 14) {
          cnpjDigits = cleanCnpj;
          formattedCnpj = cleanCnpj.replace(
            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
            '$1.$2.$3/$4-$5'
          );
        } else if (cleanCnpj.length > 0) {
          // Mantém o CNPJ bruto se não tiver exatamente 14 dígitos
          formattedCnpj = cnpjRaw.trim();
          cnpjDigits = cleanCnpj;
        }
      }

      // Deduplicação interna na planilha por WhatsApp normalizado ou CNPJ
      if (seenPhones.has(normalizedPhone)) {
        duplicatesCount++;
        continue;
      }

      if (cnpjDigits && seenCnpjs.has(cnpjDigits)) {
        duplicatesCount++;
        continue;
      }

      seenPhones.add(normalizedPhone);
      if (cnpjDigits) seenCnpjs.add(cnpjDigits);

      validRows.push({
        churchName: resolvedChurchName,
        cnpj: formattedCnpj,
        cnpjDigits,
        pastorName: resolvedPastorName,
        rawPhone: phoneRaw.trim(),
        normalizedPhone,
        email: emailRaw ? emailRaw.trim().toLowerCase() : undefined,
        cityUf: cityUf ? cityUf.trim() : undefined,
        denomination: denomination ? denomination.trim() : undefined
      });
    }

    return {
      validRows,
      invalidRows,
      duplicatesCount,
      totalProcessed: rawRows.length
    };
  }

  /**
   * Localiza o valor de uma coluna comparando chaves sem acentos, espaços ou caracteres especiais
   */
  private static extractFieldValue(row: any, candidates: string[]): string {
    const rowKeys = Object.keys(row);
    const normalizeKey = (k: string) =>
      k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeKey(candidate);
      const foundKey = rowKeys.find((k) => normalizeKey(k) === normalizedCandidate);
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        const val = String(row[foundKey]).trim();
        if (val.length > 0) return val;
      }
    }
    return '';
  }
}
