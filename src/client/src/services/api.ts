import {
  DashboardMetrics,
  EventItem,
  PersonItem,
  ConversationItem,
  CampaignItem
} from '../types.js';

const API_BASE = '/api';

export const api = {
  // Métricas
  async getMetrics(): Promise<DashboardMetrics> {
    const res = await fetch(`${API_BASE}/metrics/dashboard`);
    if (!res.ok) throw new Error('Falha ao buscar métricas');
    return res.json();
  },

  // Eventos
  async getEvents(): Promise<EventItem[]> {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error('Falha ao listar eventos');
    return res.json();
  },

  async getEventById(id: string): Promise<EventItem> {
    const res = await fetch(`${API_BASE}/events/${id}`);
    if (!res.ok) throw new Error('Falha ao buscar evento');
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no envio' }));
      throw new Error(err.error || 'Falha ao importar planilha');
    }
    return res.json();
  },

  // Campanhas
  async getCampaigns(): Promise<CampaignItem[]> {
    const res = await fetch(`${API_BASE}/campaigns`);
    if (!res.ok) throw new Error('Falha ao listar campanhas');
    return res.json();
  },

  async dispatchCampaign(data: {
    eventId: string;
    type: 'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP';
    templateName?: string;
    messageTemplate: string;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/campaigns/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro no disparo' }));
      throw new Error(err.error || 'Falha ao disparar campanha');
    }
    return res.json();
  },

  // Conversas & Atendimento
  async getConversations(): Promise<ConversationItem[]> {
    const res = await fetch(`${API_BASE}/conversations`);
    if (!res.ok) throw new Error('Falha ao listar conversas');
    return res.json();
  },

  async replyConversation(conversationId: string, text: string): Promise<any> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error('Falha ao enviar resposta');
    return res.json();
  },

  // Pessoas
  async getPersons(search?: string, optOut?: boolean): Promise<PersonItem[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (optOut !== undefined) params.append('optOut', String(optOut));

    const res = await fetch(`${API_BASE}/persons?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao buscar pessoas');
    return res.json();
  },

  // Sandbox Simulator
  async simulateReply(fromPhone: string, text: string): Promise<any> {
    const res = await fetch(`${API_BASE}/sandbox/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPhone, text })
    });
    if (!res.ok) throw new Error('Falha ao simular mensagem');
    return res.json();
  },

  async getSandboxHistory(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/sandbox/history`);
    if (!res.ok) throw new Error('Falha ao buscar histórico do sandbox');
    return res.json();
  }
};
