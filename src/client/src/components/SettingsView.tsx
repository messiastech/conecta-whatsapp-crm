import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { OrganizationSettingsItem } from '../types.js';
import { Settings, Shield, MessageSquare, Bot, Check, AlertCircle, Save } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [settingsData, setSettingsData] = useState<OrganizationSettingsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states - General
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [language, setLanguage] = useState('pt-BR');
  const [aiProvider, setAiProvider] = useState('GEMINI');
  const [geminiKey, setGeminiKey] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [promptOverrides, setPromptOverrides] = useState('');

  // Form states - WhatsApp
  const [isMock, setIsMock] = useState(true);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookToken, setWebhookToken] = useState('conecta_webhook_token_secret_2026');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getOrganizationSettings();
      setSettingsData(data);
      setTimezone(data.settings.timezone);
      setLanguage(data.settings.language);
      setAiProvider(data.settings.aiProvider);
      setPromptOverrides(data.settings.promptOverrides || '');

      setIsMock(data.whatsApp.isMock);
      setPhoneNumberId(data.whatsApp.phoneNumberId || '');
      setWabaId(data.whatsApp.wabaId || '');
      setWebhookToken(data.whatsApp.webhookVerifyToken || 'conecta_webhook_token_secret_2026');
    } catch (err: any) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);

    try {
      // 1. Atualiza configurações gerais e IA
      await api.updateOrganizationSettings({
        timezone,
        language,
        aiProvider,
        geminiApiKey: geminiKey || undefined,
        openAiApiKey: openAiKey || undefined,
        promptOverrides
      });

      // 2. Atualiza conexão WhatsApp
      await api.updateWhatsAppConnection({
        isMock,
        phoneNumberId,
        wabaId,
        accessToken: accessToken || undefined,
        appSecret: appSecret || undefined,
        webhookVerifyToken: webhookToken
      });

      setSuccessMsg('Configurações salvas e criptografadas com sucesso!');
      setGeminiKey('');
      setOpenAiKey('');
      setAccessToken('');
      setAppSecret('');
      loadSettings();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-slate-400">
        Carregando configurações do Workspace...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-900 text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Settings className="w-6 h-6 text-emerald-400" />
              Configurações do Workspace
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Gerencie parâmetros exclusivos de IA, Meta WhatsApp Cloud API e segurança para este tenant.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Workspace: {settingsData?.organization.name}
            </span>
          </div>
        </div>

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center gap-2.5 animate-fadeIn">
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSaveAll} className="space-y-6">
          {/* Seção 1: Conexão WhatsApp por Tenant */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">WhatsApp Business Connection</h2>
                  <p className="text-xs text-slate-400">
                    Defina se este workspace utiliza o simulador local (Mock) ou a Meta Cloud API oficial.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsMock(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isMock ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mock Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setIsMock(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    !isMock ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Meta Cloud API
                </button>
              </div>
            </div>

            {!isMock ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number ID</label>
                  <input
                    type="text"
                    value={phoneNumberId}
                    onChange={e => setPhoneNumberId(e.target.value)}
                    placeholder="Ex: 109876543210987"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">WABA ID (Conta Business)</label>
                  <input
                    type="text"
                    value={wabaId}
                    onChange={e => setWabaId(e.target.value)}
                    placeholder="Ex: 98765432109876"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    System User Access Token {settingsData?.whatsApp.hasAccessToken && '(Configurado ✓)'}
                  </label>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    placeholder={settingsData?.whatsApp.hasAccessToken ? '••••••••••••••••' : 'EAAG...'}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    App Secret {settingsData?.whatsApp.hasAppSecret && '(Configurado ✓)'}
                  </label>
                  <input
                    type="password"
                    value={appSecret}
                    onChange={e => setAppSecret(e.target.value)}
                    placeholder={settingsData?.whatsApp.hasAppSecret ? '••••••••••••••••' : 'Chave secreta do App'}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Webhook Verify Token</label>
                  <input
                    type="text"
                    value={webhookToken}
                    onChange={e => setWebhookToken(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/80 text-xs text-slate-300 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  Este workspace está operando no <strong>Modo Mock Sandbox</strong>. Todas as mensagens enviadas e recebidas são processadas instantaneamente no emulador visual sem cobranças da Meta.
                </span>
              </div>
            )}
          </div>

          {/* Seção 2: Configuração de Inteligência Artificial */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Inteligência Artificial & Triagem</h2>
                <p className="text-xs text-slate-400">
                  Defina o modelo de IA e chaves dedicadas para análise semântica e sugestão de acolhimento.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Provedor de IA Principal</label>
                <select
                  value={aiProvider}
                  onChange={e => setAiProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="GEMINI">Google Gemini Flash (Nuvem)</option>
                  <option value="OPENAI">OpenAI GPT-4o-mini (Nuvem)</option>
                  <option value="LOCAL_FALLBACK">Motor Heurístico Local (100% Offline)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Chave API Personalizada (Gemini / OpenAI)
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder={settingsData?.settings.hasCustomGeminiKey ? 'Chave ativa criptografada ✓' : 'Deixe vazio para usar chave global'}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Instruções Adicionais de Acolhimento Pastoral (Prompt Overrides)
                </label>
                <textarea
                  rows={3}
                  value={promptOverrides}
                  onChange={e => setPromptOverrides(e.target.value)}
                  placeholder="Ex: Dar ênfase especial ao grupo de casais e reforçar acolhimento caloroso em casos de saúde..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Parâmetros Regionais e Segurança */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Localização & Segurança de Dados</h2>
                <p className="text-xs text-slate-400">
                  Fuso horário para cálculos da janela de 24 horas e criptografia AES-256 de chaves.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-700/60">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Timezone / Fuso Horário</label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="America/Sao_Paulo">Horário de Brasília (America/Sao_Paulo)</option>
                  <option value="America/Manaus">Horário do Amazonas (America/Manaus)</option>
                  <option value="America/Recife">Horário de Recife / Nordeste (America/Recife)</option>
                  <option value="UTC">UTC Padrão</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Idioma de Comunicação</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="pt-BR">Português (Brasil) - pt_BR</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Español</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Alterações do Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
