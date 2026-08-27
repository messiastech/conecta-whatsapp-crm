import { describe, it, expect } from 'vitest';
import { PhoneNumber } from '../src/domain/value-objects/phone-number.vo.js';

describe('PhoneNumber Value Object & Validação E.164 Brasil', () => {
  it('deve normalizar telefone celular padrão com DDD e máscara', () => {
    const result = PhoneNumber.normalize('(11) 98765-4321');
    expect(result.isValid).toBe(true);
    expect(result.normalizedPhone).toBe('+5511987654321');
    expect(result.isMobile).toBe(true);
  });

  it('deve normalizar celular com DDI 55 e espaços', () => {
    const result = PhoneNumber.normalize('+55 21 99887-6655');
    expect(result.isValid).toBe(true);
    expect(result.normalizedPhone).toBe('+5521998876655');
    expect(result.isMobile).toBe(true);
  });

  it('deve normalizar número com zero inicial de longa distância (011...)', () => {
    const result = PhoneNumber.normalize('011987654321');
    expect(result.isValid).toBe(true);
    expect(result.normalizedPhone).toBe('+5511987654321');
  });

  it('deve adicionar automaticamente o 9º dígito para celular legado de 8 dígitos', () => {
    const result = PhoneNumber.normalize('31 8877-6655');
    expect(result.isValid).toBe(true);
    expect(result.normalizedPhone).toBe('+5531988776655');
    expect(result.isMobile).toBe(true);
  });

  it('deve identificar telefone fixo e sinalizar isMobile = false', () => {
    const result = PhoneNumber.normalize('(41) 3232-4455');
    expect(result.isValid).toBe(true);
    expect(result.normalizedPhone).toBe('+554132324455');
    expect(result.isMobile).toBe(false);
  });

  it('deve rejeitar DDD inválido ou inexistente', () => {
    const result = PhoneNumber.normalize('(00) 98765-4321');
    expect(result.isValid).toBe(false);
    expect(result.normalizedPhone).toBeNull();
    expect(result.error).toContain('DDD 0');
  });

  it('deve rejeitar números com quantidade insuficiente de dígitos', () => {
    const result = PhoneNumber.normalize('123456');
    expect(result.isValid).toBe(false);
    expect(result.normalizedPhone).toBeNull();
  });

  it('deve formatar número amigavelmente para exibição', () => {
    const phone = PhoneNumber.create('(11) 98765-4321');
    expect(phone.getFormatted()).toBe('+55 (11) 98765-4321');
  });
});
