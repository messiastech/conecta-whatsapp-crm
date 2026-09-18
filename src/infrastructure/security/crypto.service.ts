import crypto from 'crypto';

/**
 * Serviço de Criptografia AES-256-GCM para Secrets por Tenant
 * Utilizado para criptografar tokens Meta (Access Token, App Secret) e chaves de IA no banco.
 */
export class CryptoService {
  private static algorithm = 'aes-256-gcm';

  private static getMasterKey(): Buffer {
    const rawKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!rawKey) {
      throw new Error('[Security] ENCRYPTION_MASTER_KEY não configurada no ambiente. Operação criptográfica abortada.');
    }
    // Garante exatamente 32 bytes (256 bits) usando SHA-256 da chave fornecida
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Criptografa um texto em formato seguro com IV e AuthTag
   * Retorna formato: "iv:authTag:encryptedData" (em hexadecimal)
   */
  public static encrypt(plainText: string): string {
    if (!plainText) return '';

    const key = this.getMasterKey();
    const iv = crypto.randomBytes(12); // Padrão recomendado de 12 bytes para GCM
    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Descriptografa uma string cifrada no formato "iv:authTag:encryptedData"
   */
  public static decrypt(cipherText: string): string {
    if (!cipherText || !cipherText.includes(':')) return '';

    try {
      const parts = cipherText.split(':');
      if (parts.length !== 3) return '';

      const [ivHex, authTagHex, encryptedHex] = parts;
      const key = this.getMasterKey();
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: any) {
      console.error('[CryptoService] Falha ao descriptografar payload:', err.message);
      return '';
    }
  }
}
