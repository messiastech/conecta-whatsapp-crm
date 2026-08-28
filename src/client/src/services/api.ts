import {
  DashboardMetrics,
  EventItem,
  CampaignItem,
  ConversationItem,
  PersonItem,
  FollowUpTaskItem,
  RelationshipTimelineItem
} from '../types.js';

const API_BASE = '/api';

export const api = {
  // Metrics
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await fetch(`${API_BASE}/metrics/dashboard`);
    if (!res.ok) throw new Error('Falha ao obter métricas');
    return res.json();
  },

  // Events
  async getEvents(): Promise<EventItem[]> {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error('Falha ao obter eventos');
    return res.json();
  },

  async getEventById(id: string): Promise<EventItem> {
    const res = await fetch(`${API_BASE}/events/${id}`);
    if (!res.ok) throw new Error('Falha ao obter evento');
    return res.json();
  },

  async createEvent(data: { name: string; description?: string; eventDate: string; location?: string }): Promise<EventItem> {
    const res = await fetch(`${API_BASE}/events`, {
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

    const res = await fetch(`${API_BASE}/events/${eventId}/import`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Falha ao importar planilha');
    return res.json();
  },

  // Campaigns
  async getCampaigns(): Promise<CampaignItem[]> {
    const res = await fetch(`${API_BASE}/campaigns`);
    if (!res.ok) throw new Error('Falha ao obter campanhas');
    return res.json();
  },

  async dispatchCampaign(data: {
    eventId: string;
    type: 'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP';
    templateName?: string;
    messageTemplate: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao disparar campanha');
    return res.json();
  },

  // Conversations
  async getConversations(): Promise<ConversationItem[]> {
    const res = await fetch(`${API_BASE}/conversations`);
    if (!res.ok) throw new Error('Falha ao obter conversas');
    return res.json();
  },

  async getConversationById(id: string): Promise<ConversationItem> {
    const res = await fetch(`${API_BASE}/conversations/${id}`);
    if (!res.ok) throw new Error('Falha ao obter conversa');
    return res.json();
  },

  async replyConversation(id: string, text: string): Promise<any> {
    const res = await fetch(`${API_BASE}/conversations/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error('Falha ao enviar resposta');
    return res.json();
  },

  // Persons (CRM) & Timeline
  async getPersons(search?: string, optOut?: boolean): Promise<PersonItem[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (optOut !== undefined) params.append('optOut', String(optOut));

    const res = await fetch(`${API_BASE}/persons?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter pessoas');
    return res.json();
  },

  async getPersonTimeline(id: string): Promise<{ person: PersonItem; timeline: RelationshipTimelineItem[] }> {
    const res = await fetch(`${API_BASE}/persons/${id}/timeline`);
    if (!res.ok) throw new Error('Falha ao obter linha do tempo do contato');
    return res.json();
  },

  async updatePerson(id: string, data: { name?: string; notes?: string; optOut?: boolean }): Promise<PersonItem> {
    const res = await fetch(`${API_BASE}/persons/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Falha ao atualizar dados do contato');
    return res.json();
  },

  // Tasks & Pastoral Follow-Up
  async getTasks(status?: string, priority?: string): Promise<FollowUpTaskItem[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);

    const res = await fetch(`${API_BASE}/tasks?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter tarefas de acompanhamento');
    return res.json();
  },

  async updateTaskStatus(id: string, status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED', assignedTo?: string): Promise<FollowUpTaskItem> {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, assignedTo })
    });
    if (!res.ok) throw new Error('Falha ao atualizar status da tarefa');
    return res.json();
  },

  // Sandbox Simulator
  async getSandboxHistory(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/sandbox/history`);
    if (!res.ok) return [];
    return res.json();
  },

  async simulateReply(fromPhone: string, text: string): Promise<any> {
    const res = await fetch(`${API_BASE}/sandbox/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPhone, text })
    });
    if (!res.ok) throw new Error('Falha ao simular recebimento no WhatsApp');
    return res.json();
  }
};
