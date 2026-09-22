import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface SaveFileParams {
  organizationId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  sha256?: string;
}

export interface StoredFileResult {
  storageKey: string;
  fileHash: string;
  sizeBytes: number;
  filePath: string;
  sanitizedName: string;
}

/**
 * Serviço de Armazenamento Seguro de Mídias (Tenant-Isolated)
 * Garante que binários brutos NÃO sejam salvos no banco PostgreSQL (Neon).
 */
export class MediaStorageService {
  private static baseStorageDir = path.resolve(process.cwd(), 'storage', 'media');

  private static ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Sanitiza nomes de arquivos para evitar path traversal ou injeção de caracteres perigosos.
   */
  public static sanitizeFileName(fileName?: string): string {
    if (!fileName) return 'attachment.bin';
    // Remove barras, dois pontos, null bytes e caracteres de controle
    const base = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    return base || 'attachment.bin';
  }

  /**
   * Salva o buffer em disco/storage de forma isolada por tenant (organizationId).
   */
  public static async saveFile(params: SaveFileParams): Promise<StoredFileResult> {
    const { organizationId, buffer, originalName } = params;
    if (!organizationId) {
      throw new Error('[STORAGE_SECURITY] organizationId é obrigatório para isolamento multi-tenant.');
    }

    const fileHash = params.sha256 || crypto.createHash('sha256').update(buffer).digest('hex');
    const sanitizedName = this.sanitizeFileName(originalName);

    // Organização em subdiretórios por tenant
    const tenantDir = path.join(this.baseStorageDir, organizationId);
    this.ensureDirExists(tenantDir);

    // Nome único baseado no hash + nome sanitizado
    const fileName = `${fileHash.slice(0, 16)}_${sanitizedName}`;
    const destinationPath = path.join(tenantDir, fileName);

    // Idempotência: se o arquivo já existir com o mesmo hash, reutiliza
    if (!fs.existsSync(destinationPath)) {
      await fs.promises.writeFile(destinationPath, buffer);
    }

    const storageKey = `tenants/${organizationId}/media/${fileName}`;

    return {
      storageKey,
      fileHash,
      sizeBytes: buffer.length,
      filePath: destinationPath,
      sanitizedName
    };
  }

  /**
   * Lê o arquivo verificando estritamente o isolamento de tenant.
   */
  public static async getFile(storageKey: string, organizationId: string): Promise<Buffer> {
    if (!storageKey.includes(`tenants/${organizationId}/`)) {
      throw new Error('[STORAGE_SECURITY] Violação de segurança: acesso cruzado a mídia de outro tenant.');
    }

    const parts = storageKey.split(`tenants/${organizationId}/media/`);
    if (parts.length < 2) {
      throw new Error('[STORAGE_SECURITY] Formato de storageKey inválido.');
    }

    const fileName = path.basename(parts[1]);
    const filePath = path.join(this.baseStorageDir, organizationId, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`[STORAGE_NOT_FOUND] Arquivo não encontrado: ${storageKey}`);
    }

    return fs.promises.readFile(filePath);
  }

  /**
   * Limpa storage em testes ou rotinas de manutenção.
   */
  public static clearTenantStorage(organizationId: string): void {
    const tenantDir = path.join(this.baseStorageDir, organizationId);
    if (fs.existsSync(tenantDir)) {
      fs.rmSync(tenantDir, { recursive: true, force: true });
    }
  }
}
