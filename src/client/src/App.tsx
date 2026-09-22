import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { DashboardView } from './components/DashboardView.js';
import { EventsView } from './components/EventsView.js';
import { CampaignsView } from './components/CampaignsView.js';
import { ConversationsView } from './components/ConversationsView.js';
import { TasksView } from './components/TasksView.js';
import { PersonsView } from './components/PersonsView.js';
import { SettingsView } from './components/SettingsView.js';
import { SandboxPhoneSimulator } from './components/SandboxPhoneSimulator.js';
import { LoginView } from './components/LoginView.js';
import { api } from './services/api.js';
import {
  DashboardMetrics,
  EventItem,
  CampaignItem,
  ConversationItem,
  PersonItem,
  AuthUser,
  OrganizationItem
} from './types.js';
import { Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  // Auth & Multi-Tenancy States
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  // CRM Data States
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [persons, setPersons] = useState<PersonItem[]>([]);
  const [campaignPreselectedEventId, setCampaignPreselectedEventId] = useState<string | null>(null);

  // Load CRM data for active tenant
  const loadAllData = useCallback(async () => {
    if (!user || !activeOrgId) return;
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
  }, [user, activeOrgId]);

  // Check existing session on boot
  useEffect(() => {
    const initAuth = async () => {
      setLoadingAuth(true);
      try {
        const session = await api.getSession();
        if (session && session.user) {
          setUser(session.user);
          // Load organizations for user
          const orgs = await api.getMyOrganizations();
          setOrganizations(orgs);
          if (orgs.length > 0) {
            const savedOrgId = api.getActiveOrganization();
            const validSavedOrg = orgs.find(o => o.id === savedOrgId);
            const targetOrgId = validSavedOrg ? validSavedOrg.id : orgs[0].id;
            api.setActiveOrganization(targetOrgId);
            setActiveOrgId(targetOrgId);
          }
        }
      } catch (err) {
        console.error('Falha ao verificar sessão:', err);
        setUser(null);
      } finally {
        setLoadingAuth(false);
      }
    };

    initAuth();
  }, []);

  // Refresh data whenever active organization changes
  useEffect(() => {
    if (user && activeOrgId) {
      loadAllData();
      const interval = setInterval(loadAllData, 10000);
      return () => clearInterval(interval);
    }
  }, [user, activeOrgId, loadAllData]);

  // Handle successful login or register
  const handleAuthSuccess = async (authUser: AuthUser) => {
    setUser(authUser);
    try {
      const orgs = await api.getMyOrganizations();
      setOrganizations(orgs);
      if (orgs.length > 0) {
        const targetOrgId = orgs[0].id;
        api.setActiveOrganization(targetOrgId);
        setActiveOrgId(targetOrgId);
      }
    } catch (err) {
      console.error('Erro ao buscar organizações pós-login:', err);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err);
    } finally {
      setUser(null);
      setOrganizations([]);
      setActiveOrgId(null);
      setMetrics(null);
      setEvents([]);
      setCampaigns([]);
      setConversations([]);
      setPersons([]);
      setCurrentTab('dashboard');
    }
  };

  // Switch active organization
  const handleSelectOrg = (orgId: string) => {
    api.setActiveOrganization(orgId);
    setActiveOrgId(orgId);
  };

  // Create new organization
  const handleCreateOrg = async (name: string) => {
    const newOrg = await api.createOrganization(name);
    const updatedOrgs = [...organizations, newOrg];
    setOrganizations(updatedOrgs);
    handleSelectOrg(newOrg.id);
  };

  const handleSelectCampaignEvent = (eventId: string) => {
    setCampaignPreselectedEventId(eventId);
    setCurrentTab('campaigns');
  };

  // Loading Screen
  if (loadingAuth) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">Conecta WhatsApp CRM</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Carregando sessão segura...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Auth View
  if (!user) {
    return <LoginView onAuthSuccess={handleAuthSuccess} />;
  }

  // Active Organization Display Name
  const activeOrg = organizations.find(o => o.id === activeOrgId);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar with Multi-Tenant Workspace Selector */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        pendingAttentionCount={metrics?.pendingAttentionCount || 0}
        pendingTasksCount={metrics?.pendingFollowUpsCount || 0}
        organizations={organizations}
        activeOrgId={activeOrgId}
        onSelectOrg={handleSelectOrg}
        onCreateOrg={handleCreateOrg}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top App Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {activeOrg ? activeOrg.name : 'Workspace'} /
            </span>
            <span className="text-sm font-bold text-slate-900">
              {activeOrg?.verticalProfile === 'ACCOUNTING' ? (
                <>
                  {currentTab === 'dashboard' && 'Dashboard de Atendimento & Gestão para Igrejas'}
                  {currentTab === 'persons' && 'Igrejas & Clientes (CRM)'}
                  {currentTab === 'conversations' && 'Atendimentos & Triagem Especializada'}
                  {currentTab === 'tasks' && 'Pendências Fiscais & Cartoriais'}
                  {currentTab === 'settings' && 'Configurações da Assessoria & IA'}
                  {currentTab === 'sandbox' && 'Emulador Sandbox WhatsApp (Yeshua Desk)'}
                </>
              ) : (
                <>
                  {currentTab === 'dashboard' && 'Dashboard de Engajamento & Presença'}
                  {currentTab === 'events' && 'Gestão de Eventos e Presença'}
                  {currentTab === 'campaigns' && 'Campanhas Pós-Evento (WhatsApp)'}
                  {currentTab === 'conversations' && 'Central de Conversas & Triagem Inteligente'}
                  {currentTab === 'tasks' && 'Acompanhamentos Pastorais & Tarefas'}
                  {currentTab === 'persons' && 'Base de Pessoas & Linha do Tempo (CRM)'}
                  {currentTab === 'settings' && 'Configurações do Workspace & Integrações'}
                  {currentTab === 'sandbox' && 'Emulador Sandbox WhatsApp'}
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {activeOrg?.verticalProfile === 'ACCOUNTING' ? (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200 text-xs font-semibold">
                <span className={`w-2 h-2 rounded-full ${activeOrg.isMock ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                <span>{activeOrg.brandName || 'YESHUA DESK IGREJAS'} {activeOrg.isMock ? '(Sandbox)' : '(Produção)'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Modo Sandbox Ativo (Mock WhatsApp)</span>
              </div>
            )}
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
              persons={persons}
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

          {currentTab === 'tasks' && (
            <TasksView
              onRefresh={loadAllData}
            />
          )}

          {currentTab === 'persons' && (
            <PersonsView
              persons={persons}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView />
          )}

          {currentTab === 'sandbox' && (
            <SandboxPhoneSimulator />
          )}
        </div>
      </main>
    </div>
  );
};
