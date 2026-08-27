import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { DashboardView } from './components/DashboardView.js';
import { EventsView } from './components/EventsView.js';
import { CampaignsView } from './components/CampaignsView.js';
import { ConversationsView } from './components/ConversationsView.js';
import { PersonsView } from './components/PersonsView.js';
import { SandboxPhoneSimulator } from './components/SandboxPhoneSimulator.js';
import { api } from './services/api.js';
import { DashboardMetrics, EventItem, CampaignItem, ConversationItem, PersonItem } from './types.js';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [persons, setPersons] = useState<PersonItem[]>([]);
  const [campaignPreselectedEventId, setCampaignPreselectedEventId] = useState<string | null>(null);

  const loadAllData = async () => {
    try {
      const [m, evs, camps, convs, pers] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getEvents().catch(() => []),
        api.getCampaigns().catch(() => []),
        api.getConversations().catch(() => []),
        api.getPersons().catch(() => [])
      ]);

      if (m) setMetrics(m);
      setEvents(evs);
      setCampaigns(camps);
      setConversations(convs);
      setPersons(pers);
    } catch (err) {
      console.error('Erro ao carregar dados do CRM:', err);
    }
  };

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectCampaignEvent = (eventId: string) => {
    setCampaignPreselectedEventId(eventId);
    setCurrentTab('campaigns');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        pendingAttentionCount={metrics?.pendingAttentionCount || 0}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top App Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Módulo Atual /</span>
            <span className="text-sm font-bold text-slate-900 capitalize">
              {currentTab === 'dashboard' && 'Dashboard de Engajamento'}
              {currentTab === 'events' && 'Gestão de Eventos e Presença'}
              {currentTab === 'campaigns' && 'Campanhas Pós-Evento (WhatsApp)'}
              {currentTab === 'conversations' && 'Central de Conversas e Triagem de IA'}
              {currentTab === 'persons' && 'Base de Pessoas e CRM'}
              {currentTab === 'sandbox' && 'Emulador Sandbox WhatsApp'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Modo Sandbox Ativo (Mock WhatsApp)</span>
            </div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <div className="p-8 flex-1">
          {currentTab === 'dashboard' && (
            <DashboardView
              metrics={metrics}
              onNavigate={setCurrentTab}
            />
          )}

          {currentTab === 'events' && (
            <EventsView
              events={events}
              onRefresh={loadAllData}
              onSelectCampaignEvent={handleSelectCampaignEvent}
            />
          )}

          {currentTab === 'campaigns' && (
            <CampaignsView
              events={events}
              campaigns={campaigns}
              preselectedEventId={campaignPreselectedEventId}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === 'conversations' && (
            <ConversationsView
              conversations={conversations}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === 'persons' && (
            <PersonsView
              persons={persons}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === 'sandbox' && (
            <SandboxPhoneSimulator />
          )}
        </div>
      </main>
    </div>
  );
};
