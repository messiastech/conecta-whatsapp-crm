import {
  DashboardMetrics,
  EventItem,
  CampaignItem,
  ConversationItem,
  PersonItem,
  FollowUpTaskItem,
  RelationshipTimelineItem,
  AuthUser,
  OrganizationItem,
  OrganizationSettingsItem
} from '../types.js';

const API_BASE = '/api';

let activeOrganizationId: string | null = localStorage.getItem('conecta_active_org_id');

export const setGlobalActiveOrgId = (orgId: string | null) => {
  activeOrganizationId = orgId;
  if (orgId) {
    localStorage.setItem('conecta_active_org_id', orgId);
  } else {
    localStorage.removeItem('conecta_active_org_id');
  }
};

export const getGlobalActiveOrgId = () => activeOrganizationId;

/**
 * Wrapper de fetch com credenciais de sessão (cookies) e header multi-tenant
 */
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});

  if (activeOrganizationId && !headers.has('x-organization-id')) {
    headers.set('x-organization-id', activeOrganizationId);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // Envia cookies de sessão Better Auth
  });

  return res;
}

export const api = {
  // --- Configuração Pública / Branding ---
  async getPublicConfig(): Promise<{
    verticalProfile?: string;
    allowPublicSignup?: boolean;
    brandName?: string;
    brandSubtitle?: string;
    demoUserEmail?: string;
  }> {
    try {
      const res = await apiFetch(`${API_BASE}/public-config`);
      if (res.ok) return await res.json();
    } catch {}
    return {
      verticalProfile: 'DEFAULT',
      allowPublicSignup: true,
      brandName: 'Conecta CRM',
      brandSubtitle: 'SaaS Multi-Tenant & IA'
    };
  },

  // --- Autenticação (Better Auth) ---
  async login(email: string, password: string): Promise<{ user: AuthUser }> {
    const res = await apiFetch(`${API_BASE}/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao realizar login');
    }
    return res.json();
  },

  async signUp(name: string, email: string, password: string): Promise<{ user: AuthUser }> {
    const res = await apiFetch(`${API_BASE}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao criar conta');
    }
    return res.json();
  },

  async logout(): Promise<void> {
    await apiFetch(`${API_BASE}/auth/sign-out`, {
      method: 'POST'
    });
    setGlobalActiveOrgId(null);
  },

  async getSession(): Promise<{ user: AuthUser; session: any } | null> {
    try {
      const res = await apiFetch(`${API_BASE}/auth/get-session`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.user ? data : null;
    } catch {
      return null;
    }
  },

  // --- Organizações / Workspaces ---
  async getMyOrganizations(): Promise<OrganizationItem[]> {
    const res = await apiFetch(`${API_BASE}/organizations/my`);
    if (!res.ok) throw new Error('Falha ao obter workspaces');
    return res.json();
  },

  async createOrganization(name: string, slug?: string): Promise<OrganizationItem> {
    const res = await apiFetch(`${API_BASE}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug })
    });
    if (!res.ok) throw new Error('Falha ao criar organização');
    return res.json();
  },

  async getOrganizationSettings(): Promise<OrganizationSettingsItem> {
    const res = await apiFetch(`${API_BASE}/organization/settings`);
    if (!res.ok) throw new Error('Falha ao obter configurações da organização');
    return res.json();
  },

  async updateOrganizationSettings(data: {
    timezone?: string;
    language?: string;
    aiProvider?: string;
    geminiApiKey?: string;
    openAiApiKey?: string;
    promptOverrides?: string;
  }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/organization/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao atualizar configurações');
    return res.json();
  },

  async updateWhatsAppConnection(data: {
    isMock?: boolean;
    phoneNumberId?: string;
    wabaId?: string;
    accessToken?: string;
    appSecret?: string;
    webhookVerifyToken?: string;
  }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/organization/whatsapp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao atualizar conexão WhatsApp');
    return res.json();
  },

  // --- WhatsApp Lifecycle & Channel Operations ---
  async getWhatsAppStatus(): Promise<{
    status: 'NAO_CONECTADO' | 'AGUARDANDO_QR' | 'CONECTANDO' | 'CONECTADO' | 'DESCONECTADO' | 'ERRO';
    connectedPhone?: string | null;
    connectedAt?: string | null;
    lastActivityAt?: string | null;
    qrCode?: string | null;
    sessionId?: string | null;
    provider: 'GPN';
    isOperating: boolean;
    errorMessage?: string | null;
  }> {
    const res = await apiFetch(`${API_BASE}/organization/whatsapp/status`);
    if (!res.ok) throw new Error('Falha ao obter status do canal WhatsApp');
    return res.json();
  },

  async connectWhatsApp(): Promise<any> {
    const res = await apiFetch(`${API_BASE}/organization/whatsapp/connect`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Falha ao iniciar pareamento do WhatsApp');
    return res.json();
  },

  async reconnectWhatsApp(): Promise<any> {
    const res = await apiFetch(`${API_BASE}/organization/whatsapp/reconnect`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Falha ao solicitar reconexão do WhatsApp');
    return res.json();
  },

  async replaceWhatsAppNumber(confirm: boolean, reason?: string): Promise<any> {
    const res = await apiFetch(`${API_BASE}/organization/whatsapp/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm, reason })
    });
    if (!res.ok) throw new Error('Falha ao solicitar substituição de número');
    return res.json();
  },

  async disconnectWhatsApp(): Promise<any> {
    const res = await apiFetch(`${API_BASE}/organization/whatsapp/disconnect`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Falha ao desconectar WhatsApp');
    return res.json();
  },

  // --- Metrics ---
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await apiFetch(`${API_BASE}/metrics/dashboard`);
    if (!res.ok) throw new Error('Falha ao obter métricas');
    return res.json();
  },

  // --- Events ---
  async getEvents(): Promise<EventItem[]> {
    const res = await apiFetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error('Falha ao obter eventos');
    return res.json();
  },

  async getEventById(id: string): Promise<EventItem> {
    const res = await apiFetch(`${API_BASE}/events/${id}`);
    if (!res.ok) throw new Error('Falha ao obter evento');
    return res.json();
  },

  async createEvent(data: { name: string; description?: string; eventDate: string; location?: string }): Promise<EventItem> {
    const res = await apiFetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao criar evento');
    return res.json();
  },

  async importSpreadsheet(eventId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiFetch(`${API_BASE}/events/${eventId}/import`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Falha ao importar planilha');
    return res.json();
  },

  async registerAttendance(eventId: string, data: { personId: string; attended?: boolean; notes?: string }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/events/${eventId}/attendances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao registrar presença');
    }
    return res.json();
  },

  // --- Campaigns ---
  async getCampaigns(): Promise<CampaignItem[]> {
    const res = await apiFetch(`${API_BASE}/campaigns`);
    if (!res.ok) throw new Error('Falha ao obter campanhas');
    return res.json();
  },

  async dispatchCampaign(data: {
    eventId: string;
    type: 'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP';
    templateName?: string;
    messageTemplate: string;
  }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao disparar campanha');
    return res.json();
  },

  // --- Conversations ---
  async getConversations(): Promise<ConversationItem[]> {
    const res = await apiFetch(`${API_BASE}/conversations`);
    if (!res.ok) throw new Error('Falha ao obter conversas');
    return res.json();
  },

  async getConversationById(id: string): Promise<ConversationItem> {
    const res = await apiFetch(`${API_BASE}/conversations/${id}`);
    if (!res.ok) throw new Error('Falha ao obter conversa');
    return res.json();
  },

  async replyConversation(id: string, text: string): Promise<any> {
    const res = await apiFetch(`${API_BASE}/conversations/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao enviar resposta');
    }
    return res.json();
  },

  // --- Persons (CRM) & Timeline ---
  async getPersons(search?: string, optOut?: boolean): Promise<PersonItem[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (optOut !== undefined) params.append('optOut', String(optOut));

    const res = await apiFetch(`${API_BASE}/persons?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter pessoas');
    return res.json();
  },

  async createPerson(data: { name: string; phone: string; email?: string; notes?: string }): Promise<PersonItem> {
    const res = await apiFetch(`${API_BASE}/persons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao cadastrar contato');
    }
    return res.json();
  },

  async getPersonTimeline(id: string): Promise<{ person: PersonItem; timeline: RelationshipTimelineItem[] }> {
    const res = await apiFetch(`${API_BASE}/persons/${id}/timeline`);
    if (!res.ok) throw new Error('Falha ao obter linha do tempo do contato');
    return res.json();
  },

  async updatePerson(id: string, data: { name?: string; notes?: string; optOut?: boolean }): Promise<PersonItem> {
    const res = await apiFetch(`${API_BASE}/persons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao atualizar dados do contato');
    return res.json();
  },

  async importChurches(file: File): Promise<{
    totalRows: number;
    totalImported: number;
    totalUpdated: number;
    duplicatesIgnored: number;
    invalidRows: Array<{ rowNumber: number; rawRow: any; error: string }>;
    importedChurches: Array<{
      id: string;
      name: string;
      normalizedPhone: string;
      cnpj?: string;
      isUpdate: boolean;
    }>;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiFetch(`${API_BASE}/persons/import-churches`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao importar planilha de igrejas');
    }
    return res.json();
  },

  // --- Tasks & Pastoral Follow-Up ---
  async getTasks(status?: string, priority?: string): Promise<FollowUpTaskItem[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);

    const res = await apiFetch(`${API_BASE}/tasks?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter tarefas de acompanhamento');
    return res.json();
  },

  async updateTaskStatus(id: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', assignedTo?: string): Promise<FollowUpTaskItem> {
    const res = await apiFetch(`${API_BASE}/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assignedTo })
    });
    if (!res.ok) throw new Error('Falha ao atualizar status da tarefa');
    return res.json();
  },

  // --- Sandbox Simulator ---
  async getSandboxHistory(): Promise<any[]> {
    const res = await apiFetch(`${API_BASE}/sandbox/history`);
    if (!res.ok) return [];
    return res.json();
  },

  async simulateReply(fromPhone: string, text: string): Promise<any> {
    const res = await apiFetch(`${API_BASE}/sandbox/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPhone, text })
    });
    if (!res.ok) throw new Error('Falha ao simular recebimento no WhatsApp');
    return res.json();
  },

  // --- Active Workspace Helpers ---
  getActiveOrganization(): string | null {
    return getGlobalActiveOrgId();
  },

  setActiveOrganization(orgId: string | null): void {
    setGlobalActiveOrgId(orgId);
  }
};
