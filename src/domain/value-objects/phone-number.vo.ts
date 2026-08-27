export interface PhoneValidationResult {
  isValid: boolean;
  normalizedPhone: string | null;
  isMobile: boolean;
  error?: string;
}

const VALID_BRAZILIAN_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24, // RJ
  27, 28, // ES
  31, 32, 33, 34, 35, 37, 38, // MG
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49, // SC
  51, 53, 54, 55, // RS
  61, // DF
  62, 64, // GO
  63, // TO
  65, 66, // MT
  67, // MS
  68, // AC
  69, // RO
  71, 73, 74, 75, 77, // BA
  79, // SE
  81, 87, // PE
  82, // AL
  83, // PB
  84, // RN
  85, 88, // CE
  86, 89, // PI
  91, 93, 94, // PA
  92, 97, // AM
  95, // RR
  96, // AP
  98, 99 // MA
]);

export class PhoneNumber {
  private readonly value: string;
  private readonly rawInput: string;
  private readonly isMobilePhone: boolean;

  private constructor(rawPhone: string, normalized: string, isMobile: boolean) {
    this.rawInput = rawPhone;
    this.value = normalized;
    this.isMobilePhone = isMobile;
  }

  public static normalize(rawPhone: string): PhoneValidationResult {
    if (!rawPhone || typeof rawPhone !== 'string') {
      return { isValid: false, normalizedPhone: null, isMobile: false, error: 'Telefone nulo ou vazio' };
    }

    // 1. Sanitizar mantendo apenas dígitos numéricos
    let digits = rawPhone.replace(/\D/g, '');

    // 2. Tratar prefixos internacionais e de operadora
    if (digits.startsWith('0055')) {
      digits = digits.substring(4);
    } else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      digits = digits.substring(2);
    } else if (digits.startsWith('0') && !digits.startsWith('00') && (digits.length === 11 || digits.length === 12)) {
      digits = digits.substring(1);
    }

    // 4. Validar quantidade de dígitos mínima e máxima para o Brasil (DDD + Número)
    if (digits.length < 10 || digits.length > 11) {
      return {
        isValid: false,
        normalizedPhone: null,
        isMobile: false,
        error: `Quantidade de dígitos inválida (${digits.length} dígitos encontrados)`
      };
    }

    // 5. Extrair e validar DDD
    const ddd = parseInt(digits.substring(0, 2), 10);
    if (!VALID_BRAZILIAN_DDDS.has(ddd)) {
      return {
        isValid: false,
        normalizedPhone: null,
        isMobile: false,
        error: `DDD ${ddd} inválido ou inexistente no Brasil`
      };
    }

    let localNumber = digits.substring(2);

    // 6. Tratamento de celular de 8 dígitos (adicionar 9º dígito se for celular legado)
    if (localNumber.length === 8) {
      const firstDigit = localNumber[0];
      if (['6', '7', '8', '9'].includes(firstDigit)) {
        localNumber = '9' + localNumber;
      } else {
        return {
          isValid: true,
          normalizedPhone: `+55${ddd}${localNumber}`,
          isMobile: false,
          error: 'Telefone fixo detectado (WhatsApp requer preferencialmente celular)'
        };
      }
    }

    // 7. Validação do 9º dígito obrigatório em celulares brasileiros
    if (localNumber.length === 9) {
      if (localNumber[0] !== '9') {
        return {
          isValid: false,
          normalizedPhone: null,
          isMobile: false,
          error: 'Número celular de 9 dígitos deve iniciar obrigatoriamente com o dígito 9'
        };
      }

      return {
        isValid: true,
        normalizedPhone: `+55${ddd}${localNumber}`,
        isMobile: true
      };
    }

    return {
      isValid: false,
      normalizedPhone: null,
      isMobile: false,
      error: 'Formato de telefone não reconhecido'
    };
  }

  public static create(rawPhone: string): PhoneNumber {
    const result = PhoneNumber.normalize(rawPhone);
    if (!result.isValid || !result.normalizedPhone) {
      throw new Error(result.error || `Número de telefone inválido: ${rawPhone}`);
    }
    return new PhoneNumber(rawPhone, result.normalizedPhone, result.isMobile);
  }

  public getValue(): string {
    return this.value;
  }

  public getRawInput(): string {
    return this.rawInput;
  }

  public isMobile(): boolean {
    return this.isMobilePhone;
  }

  public getFormatted(): string {
    // Retorna: +55 (DD) 9XXXX-XXXX
    const digits = this.value.replace(/\D/g, '');
    const ddd = digits.substring(2, 4);
    const num = digits.substring(4);
    if (num.length === 9) {
      return `+55 (${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
    }
    return `+55 (${ddd}) ${num.substring(0, 4)}-${num.substring(4)}`;
  }
}
