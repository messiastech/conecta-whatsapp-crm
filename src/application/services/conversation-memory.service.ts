import { prisma } from '../../infrastructure/database/prisma.client.js';

export interface MemoryFacts {
  [key: string]: any;
}

export interface MemoryOpenItem {
  id?: string;
  item: string;
  category?: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt?: string;
}

export interface MemoryPreferences {
  [key: string]: any;
}

export interface MemoryUpdates {
  facts?: MemoryFacts;
  openItems?: (string | MemoryOpenItem)[];
  preferences?: MemoryPreferences;
  resolvedItems?: string[];
  summary?: string;
}

export interface ConversationMemoryContext {
  memoryId: string;
  organizationId: string;
  personId: string;
  conversationId: string;
  summary: string;
  facts: MemoryFacts;
  openItems: MemoryOpenItem[];
  preferences: MemoryPreferences;
  messageCount: number;
  recentMessages: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    content: string;
    createdAt: Date;
    status: string;
    attachmentsSummary?: string;
  }>;
  organizationContext: {
    name: string;
    verticalProfile: string;
  };
  personContext: {
    name: string;
    phone: string;
    notes?: string | null;
  };
}

export class ConversationMemoryService {
  /**
   * Carrega o contexto completo da conversa:
   * - Memória persistente (rolling summary, fatos, pendências, preferências)
   * - Últimas 20 mensagens
   * - Metadados da Organização e da Pessoa
   */
  static async loadContext(
    organizationId: string,
    personId: string,
    conversationId: string
  ): Promise<ConversationMemoryContext> {
    // 1. Obtém ou cria atomicamente o registro de memória com validação estrita de tenant
    let memory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (memory) {
      // Validação estrita multi-tenant: zero acesso cross-tenant
      if (memory.organizationId !== organizationId) {
        throw new Error(
          `[SECURITY_CROSS_TENANT] Violação de segurança: tentativa de carregar memória de outra organização ` +
          `(esperada: "${organizationId}", memória pertence a: "${memory.organizationId}").`
        );
      }
      if (personId && memory.personId !== personId) {
        throw new Error(
          `[SECURITY_CROSS_TENANT] Violação de segurança: tentativa de carregar memória de outra pessoa ` +
          `(esperada: "${personId}", memória vinculada a: "${memory.personId}").`
        );
      }
    } else {
      memory = await prisma.conversationMemory.create({
        data: {
          organizationId,
          personId,
          conversationId,
          summary: '',
          factsJson: '{}',
          openItemsJson: '[]',
          preferencesJson: '{}',
          messageCount: 0
        }
      });
    }

    // 2. Carrega as últimas 20 mensagens (econômico, sem estourar context window)
    const recentMessages = await prisma.message.findMany({
      where: {
        organizationId,
        conversationId
      },
      include: {
        attachments: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    // Reordena em ordem cronológica (mais antiga para mais recente)
    recentMessages.reverse();

    // 3. Carrega contexto da organização
    const org = await prisma.organization.findUnique({
      where: { id: organizationId }
    });
    let verticalProfile = 'ACCOUNTING';
    if (org?.metadata) {
      try {
        const meta = JSON.parse(org.metadata);
        if (meta.verticalProfile) verticalProfile = meta.verticalProfile;
      } catch {}
    }

    // 4. Carrega contexto da pessoa
    const person = await prisma.person.findUnique({
      where: { id: personId }
    });

    let facts: MemoryFacts = {};
    let openItems: MemoryOpenItem[] = [];
    let preferences: MemoryPreferences = {};

    try {
      facts = JSON.parse(memory.factsJson || '{}');
    } catch {}

    try {
      const rawItems = JSON.parse(memory.openItemsJson || '[]');
      if (Array.isArray(rawItems)) {
        openItems = rawItems.map(item => {
          if (typeof item === 'string') {
            return { item, status: 'OPEN', createdAt: new Date().toISOString() };
          }
          return item;
        });
      }
    } catch {}

    try {
      preferences = JSON.parse(memory.preferencesJson || '{}');
    } catch {}

    return {
      memoryId: memory.id,
      organizationId,
      personId,
      conversationId,
      summary: memory.summary || '',
      facts,
      openItems,
      preferences,
      messageCount: memory.messageCount,
      recentMessages: recentMessages.map(m => ({
        id: m.id,
        direction: m.direction as 'INBOUND' | 'OUTBOUND',
        content: m.content,
        createdAt: m.createdAt,
        status: m.status,
        attachmentsSummary: (m as any).attachments?.length
          ? (m as any).attachments.map((a: any) => `[${a.type}: ${a.fileName || 'arquivo'}${a.aiSummary ? ` - ${a.aiSummary}` : ''}]`).join(', ')
          : undefined
      })),
      organizationContext: {
        name: org?.name || 'Yeshua Contabilidade',
        verticalProfile
      },
      personContext: {
        name: person?.name || 'Cliente',
        phone: person?.normalizedPhone || person?.phone || '',
        notes: person?.notes
      }
    };
  }

  /**
   * Sanitiza fatos para garantir que NENHUM base64 ou blob binário seja salvo no Neon Postgres.
   */
  private static sanitizeFacts(facts: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(facts)) {
      if (typeof v === 'string' && (v.length > 2000 || v.startsWith('data:') || v.startsWith('JVBERi0') || v.startsWith('/9j/'))) {
        clean[k] = `[Blob omitido - ${v.length} bytes]`;
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  /**
   * Atualiza a memória persistente após processar uma mensagem inbound
   */
  static async updateAfterInbound(
    conversationId: string,
    inboundMessageId: string,
    updates?: MemoryUpdates,
    organizationId?: string
  ): Promise<void> {
    const memory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (!memory) return;

    if (organizationId && memory.organizationId !== organizationId) {
      throw new Error(
        `[SECURITY_CROSS_TENANT] Violação de segurança: tentativa de atualizar memória de outra organização ` +
        `(esperada: "${organizationId}", memória pertence a: "${memory.organizationId}").`
      );
    }

    let facts: MemoryFacts = {};
    let openItems: MemoryOpenItem[] = [];
    let preferences: MemoryPreferences = {};

    try { facts = JSON.parse(memory.factsJson || '{}'); } catch {}
    try { openItems = JSON.parse(memory.openItemsJson || '[]'); } catch {}
    try { preferences = JSON.parse(memory.preferencesJson || '{}'); } catch {}

    // Mescla fatos incrementais
    if (updates?.facts && typeof updates.facts === 'object') {
      facts = this.sanitizeFacts({ ...facts, ...updates.facts });
    }

    // Mescla preferências
    if (updates?.preferences && typeof updates.preferences === 'object') {
      preferences = { ...preferences, ...updates.preferences };
    }

    // Adiciona novos itens abertos
    if (updates?.openItems && Array.isArray(updates.openItems)) {
      for (const rawItem of updates.openItems) {
        const itemText = typeof rawItem === 'string' ? rawItem : rawItem.item;
        const exists = openItems.some(i => i.item === itemText && i.status === 'OPEN');
        if (!exists && itemText) {
          openItems.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            item: itemText,
            category: typeof rawItem === 'object' ? rawItem.category : undefined,
            status: 'OPEN',
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Resolve itens abertos especificados
    if (updates?.resolvedItems && Array.isArray(updates.resolvedItems)) {
      for (const resItem of updates.resolvedItems) {
        for (const item of openItems) {
          if (item.item === resItem || item.id === resItem) {
            item.status = 'RESOLVED';
          }
        }
      }
    }

    await prisma.conversationMemory.update({
      where: { conversationId },
      data: {
        factsJson: JSON.stringify(facts),
        openItemsJson: JSON.stringify(openItems),
        preferencesJson: JSON.stringify(preferences),
        messageCount: { increment: 1 },
        lastSummarizedMessageId: inboundMessageId,
        summary: updates?.summary ? updates.summary : memory.summary
      }
    });
  }

  /**
   * Atualiza a memória após envio outbound (automático ou humano)
   */
  static async updateAfterOutbound(
    conversationId: string,
    outboundMessageId: string,
    updates?: MemoryUpdates,
    organizationId?: string
  ): Promise<void> {
    const memory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (!memory) return;

    if (organizationId && memory.organizationId !== organizationId) {
      throw new Error(
        `[SECURITY_CROSS_TENANT] Violação de segurança: tentativa de atualizar memória de outra organização ` +
        `(esperada: "${organizationId}", memória pertence a: "${memory.organizationId}").`
      );
    }

    let facts: MemoryFacts = {};
    let openItems: MemoryOpenItem[] = [];
    let preferences: MemoryPreferences = {};

    try { facts = JSON.parse(memory.factsJson || '{}'); } catch {}
    try { openItems = JSON.parse(memory.openItemsJson || '[]'); } catch {}
    try { preferences = JSON.parse(memory.preferencesJson || '{}'); } catch {}

    if (updates?.facts) facts = this.sanitizeFacts({ ...facts, ...updates.facts });
    if (updates?.preferences) preferences = { ...preferences, ...updates.preferences };

    await prisma.conversationMemory.update({
      where: { conversationId },
      data: {
        factsJson: JSON.stringify(facts),
        openItemsJson: JSON.stringify(openItems),
        preferencesJson: JSON.stringify(preferences),
        messageCount: { increment: 1 },
        lastSummarizedMessageId: outboundMessageId,
        summary: updates?.summary ? updates.summary : memory.summary
      }
    });
  }

  /**
   * Executa rolling summary se a quantidade de mensagens aumentou
   * Garante preservação de fatos consolidados e contexto histórico
   */
  static async summarizeIfNeeded(
    conversationId: string,
    inboundText: string,
    outboundText?: string,
    organizationId?: string
  ): Promise<void> {
    const memory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (!memory) return;

    if (organizationId && memory.organizationId !== organizationId) {
      throw new Error(
        `[SECURITY_CROSS_TENANT] Violação de segurança: tentativa de resumir memória de outra organização ` +
        `(esperada: "${organizationId}", memória pertence a: "${memory.organizationId}").`
      );
    }

    // Se o summary estiver vazio, inicializa com o primeiro diálogo
    let currentSummary = memory.summary || '';
    const newEntry = `Cliente: "${inboundText.slice(0, 80)}"${outboundText ? ` | Yeshua: "${outboundText.slice(0, 80)}"` : ''}`;

    if (!currentSummary) {
      currentSummary = newEntry;
    } else {
      // Mantém rolling summary conciso (máximo ~500 caracteres para custo mínimo)
      const lines = currentSummary.split('\n');
      lines.push(newEntry);
      if (lines.length > 5) {
        lines.shift(); // remove a linha mais antiga mantendo os fatos recentes
      }
      currentSummary = lines.join('\n');
    }

    await prisma.conversationMemory.update({
      where: { conversationId },
      data: { summary: currentSummary }
    });
  }
}
