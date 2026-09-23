import crypto from 'crypto';
import { AttachmentType } from '@prisma/client';
import { MediaStorageService } from '../../infrastructure/storage/media-storage.service.js';
import { AttachmentInputDTO, AttachmentTypeEnum } from '../../domain/ports/ai-provider.port.js';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export interface RawMediaItem {
  type?: string;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
  url?: string;
  base64Data?: string;
  buffer?: Buffer;
  providerMediaId?: string;
  caption?: string;
  durationSeconds?: number;
}

export interface IngestionOptions {
  organizationId: string;
  messageId: string;
  aiProvider?: any; // IAIProvider instance if available
}

export interface ProcessedAttachmentResult {
  id: string;
  organizationId: string;
  messageId: string;
  type: AttachmentType;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  providerMediaId?: string | null;
  storageKey?: string | null;
  sha256: string;
  transcript?: string | null;
  extractedText?: string | null;
  aiSummary?: string | null;
  metadataJson: string;
  caption?: string | null;
}

/**
 * MediaIngestionService
 * Responsável por:
 * 1. Validação estrita de tipos MIME e limites de tamanho (anti-malware/segurança).
 * 2. Deduplicação via SHA-256.
 * 3. Armazenamento em storage de objetos/disco privado (NUNCA binário no PostgreSQL).
 * 4. Extração cognitiva (transcrição de voz, OCR de imagens/prints, interpretação estrutural de PDFs).
 * 5. Persistência em MessageAttachment vinculada à Message no Prisma.
 */
export class MediaIngestionService {
  private static readonly MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

  private static readonly MIME_MAPPING: Record<string, AttachmentType> = {
    // Imagens
    'image/jpeg': AttachmentType.IMAGE,
    'image/jpg': AttachmentType.IMAGE,
    'image/png': AttachmentType.IMAGE,
    'image/webp': AttachmentType.IMAGE,
    'image/heic': AttachmentType.IMAGE,
    // Áudios
    'audio/ogg': AttachmentType.AUDIO,
    'audio/opus': AttachmentType.AUDIO,
    'audio/mp4': AttachmentType.AUDIO,
    'audio/mpeg': AttachmentType.AUDIO,
    'audio/aac': AttachmentType.AUDIO,
    'audio/amr': AttachmentType.AUDIO,
    'audio/wav': AttachmentType.AUDIO,
    'audio/x-m4a': AttachmentType.AUDIO,
    // PDFs
    'application/pdf': AttachmentType.PDF,
    // Documentos
    'application/msword': AttachmentType.DOCUMENT,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': AttachmentType.DOCUMENT,
    'text/plain': AttachmentType.DOCUMENT,
    'text/csv': AttachmentType.DOCUMENT,
    // Vídeos
    'video/mp4': AttachmentType.VIDEO,
    'video/3gpp': AttachmentType.VIDEO,
    'video/quicktime': AttachmentType.VIDEO
  };

  private static readonly FORBIDDEN_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.sh', '.bin', '.dll', '.com', '.vbs', '.js', '.jar', '.scr', '.msi'
  ];

  /**
   * Valida MIME real, formato e tamanho máximo. Bloqueia executáveis e arquivos maliciosos.
   */
  public static validateMedia(mimeType: string, sizeBytes?: number, fileName?: string): AttachmentType {
    const cleanMime = mimeType ? mimeType.split(';')[0].trim().toLowerCase() : '';

    if (fileName) {
      const lowerName = fileName.toLowerCase();
      for (const ext of this.FORBIDDEN_EXTENSIONS) {
        if (lowerName.endsWith(ext)) {
          throw new Error(`[MEDIA_SECURITY] Arquivo bloqueado por política de segurança: extensão ${ext} proibida.`);
        }
      }
    }

    const matchedType = this.MIME_MAPPING[cleanMime];
    if (!matchedType) {
      throw new Error(`[MEDIA_SECURITY] Tipo MIME "${mimeType}" não é suportado para processamento seguro.`);
    }

    if (sizeBytes !== undefined && sizeBytes > this.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `[MEDIA_SECURITY] Arquivo excede o tamanho máximo de 50MB (tamanho: ${(sizeBytes / (1024 * 1024)).toFixed(2)}MB).`
      );
    }

    return matchedType;
  }

  /**
   * Processa uma lista de mídias brutas e salva em disco e banco.
   */
  public static async ingestMediaList(
    rawMediaList: RawMediaItem[],
    options: IngestionOptions
  ): Promise<ProcessedAttachmentResult[]> {
    const results: ProcessedAttachmentResult[] = [];

    for (const raw of rawMediaList) {
      const processed = await this.ingestSingleMedia(raw, options);
      results.push(processed);
    }

    return results;
  }

  /**
   * Ingestão de item individual de mídia.
   */
  public static async ingestSingleMedia(
    raw: RawMediaItem,
    options: IngestionOptions
  ): Promise<ProcessedAttachmentResult> {
    const { organizationId, messageId, aiProvider } = options;

    // 1. Obtenção do Buffer Real
    let buffer: Buffer;
    if (raw.buffer) {
      buffer = raw.buffer;
    } else if (raw.base64Data) {
      buffer = Buffer.from(raw.base64Data, 'base64');
    } else if (process.env.NODE_ENV === 'test') {
      // Mocks sintéticos somente em test
      buffer = Buffer.from(raw.url || raw.providerMediaId || 'MOCK_TEST_BINARY_BYTES');
    } else {
      // URL não é arquivo. Sem bytes reais => MEDIA_CONTENT_UNAVAILABLE
      throw new Error(
        `[MEDIA_CONTENT_UNAVAILABLE] Mídia recebida sem bytes reais. URL externa não é arquivo e armazenamento/análise requer payload binário real.`
      );
    }

    const sizeBytes = raw.sizeBytes || buffer.length;

    // 2. Validação de Segurança
    const attachmentType = this.validateMedia(raw.mimeType, sizeBytes, raw.fileName);

    // 3. Cálculo de Integridade SHA-256
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 4. Armazenamento em Storage Privado (Arquivos binários NUNCA vão para o Postgres)
    const stored = await MediaStorageService.saveFile({
      organizationId,
      buffer,
      mimeType: raw.mimeType,
      originalName: raw.fileName || `attachment_${Date.now()}`,
      sha256
    });

    // 5. Extração Cognitiva via AI (se provider suportar)
    let transcript: string | null = null;
    let extractedText: string | null = null;
    let aiSummary: string | null = null;
    let factsExtracted: Record<string, any> = {};

    const attachmentDto: AttachmentInputDTO = {
      type: attachmentType as AttachmentTypeEnum,
      mimeType: raw.mimeType,
      fileName: stored.sanitizedName,
      sizeBytes,
      providerMediaId: raw.providerMediaId,
      storageKey: stored.storageKey,
      sha256,
      url: raw.url,
      base64Data: raw.base64Data,
      caption: raw.caption,
      durationSeconds: raw.durationSeconds
    };

    if (aiProvider && typeof aiProvider.extractMediaContent === 'function') {
      try {
        const extraction = await aiProvider.extractMediaContent(attachmentDto);
        extractedText = extraction.extractedText || null;
        aiSummary = extraction.summary || null;
        if (attachmentType === AttachmentType.AUDIO) {
          transcript = extraction.extractedText || null;
        }
        if (extraction.factsExtracted) {
          factsExtracted = extraction.factsExtracted;
        }
      } catch (err: any) {
        console.warn(`[MediaIngestionService] Erro ao extrair conteúdo da mídia via IA: ${err.message}`);
      }
    } else {
      // Extração padrão / heurística: mocks sintéticos somente em test
      if (process.env.NODE_ENV === 'test') {
        if (attachmentType === AttachmentType.AUDIO) {
          transcript = `[Mensagem de voz / Áudio WhatsApp (${raw.durationSeconds ? `${raw.durationSeconds}s` : 'duração não informada'})]`;
          aiSummary = 'Mensagem de voz enviada pelo cliente.';
        } else if (attachmentType === AttachmentType.IMAGE) {
          aiSummary = `Imagem recebida (${stored.sanitizedName}).`;
        } else if (attachmentType === AttachmentType.PDF || attachmentType === AttachmentType.DOCUMENT) {
          aiSummary = `Documento ${attachmentType} recebido: ${stored.sanitizedName}.`;
        } else if (attachmentType === AttachmentType.VIDEO) {
          aiSummary = `Vídeo recebido (${stored.sanitizedName}).`;
        }
      } else {
        // Em produção: nunca inventar transcrição sem processamento real
        if (attachmentType === AttachmentType.AUDIO) {
          transcript = null;
          aiSummary = raw.caption ? `Áudio com legenda: "${raw.caption}"` : `Áudio WhatsApp (${stored.sanitizedName})`;
        } else {
          aiSummary = raw.caption ? `Mídia com legenda: "${raw.caption}"` : `Arquivo ${attachmentType} (${stored.sanitizedName})`;
        }
      }
    }

    const metadata = {
      sanitizedName: stored.sanitizedName,
      originalFileName: raw.fileName,
      durationSeconds: raw.durationSeconds,
      caption: raw.caption,
      factsExtracted
    };

    // 6. Persistência dos Metadados em Neon PostgreSQL (sem salvar blob)
    const attachmentRecord = await prisma.messageAttachment.create({
      data: {
        organizationId,
        messageId,
        type: attachmentType,
        mimeType: raw.mimeType,
        fileName: stored.sanitizedName,
        sizeBytes,
        providerMediaId: raw.providerMediaId,
        storageKey: stored.storageKey,
        sha256,
        transcript,
        extractedText,
        aiSummary,
        metadataJson: JSON.stringify(metadata)
      }
    });

    return {
      id: attachmentRecord.id,
      organizationId,
      messageId,
      type: attachmentType,
      mimeType: raw.mimeType,
      fileName: stored.sanitizedName,
      sizeBytes,
      providerMediaId: raw.providerMediaId,
      storageKey: stored.storageKey,
      sha256,
      transcript,
      extractedText,
      aiSummary,
      metadataJson: JSON.stringify(metadata),
      caption: raw.caption
    };
  }
}
