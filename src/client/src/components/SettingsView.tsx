import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../services/api.js';
import { OrganizationSettingsItem } from '../types.js';
import {
  Settings,
  Shield,
  MessageSquare,
  Bot,
  Check,
  AlertCircle,
  Save,
  QrCode,
  RefreshCw,
  PhoneCall,
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRightLeft
} from 'lucide-react';

interface ChannelStatus {
  status: 'NAO_CONECTADO' | 'AGUARDANDO_QR' | 'CONECTANDO' | 'CONECTADO' | 'DESCONECTADO' | 'ERRO';
  connectedPhone?: string | null;
  connectedAt?: string | null;
  lastActivityAt?: string | null;
  qrCode?: string | null;
  provider: 'GPN';
  isOperating: boolean;
  errorMessage?: string | null;
}

export const SettingsView: React.FC = () => {
  const [settingsData, setSettingsData] = useState<OrganizationSettingsItem | null>(null);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal de Substituição de Número
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceReason, setReplaceReason] = useState('');
  const [replaceConfirm, setReplaceConfirm] = useState(false);

  // Form states - General
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [language, setLanguage] = useState('pt-BR');
  const [aiProvider, setAiProvider] = useState('GEMINI');
  const [geminiKey, setGeminiKey] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [promptOverrides, setPromptOverrides] = useState('');

  // Form states - WhatsApp Contingência (Meta)
  const [showContingencyMeta, setShowContingencyMeta] = useState(false);
  const [isMock, setIsMock] = useState(true);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [webhookToken, setWebhookToken] = useState('conecta_webhook_token_secret_2026');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [data, channel] = await Promise.all([
        api.getOrganizationSettings(),
        api.getWhatsAppStatus().catch(() => null)
      ]);

      setSettingsData(data);
      if (channel) setChannelStatus(channel);

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

  // Polling automático suave quando estiver aguardando QR Code ou conectando
  useEffect(() => {
    if (channelStatus?.status === 'AGUARDANDO_QR' || channelStatus?.status === 'CONECTANDO') {
      const interval = setInterval(() => {
        api.getWhatsAppStatus().then(st => {
          if (st) setChannelStatus(st);
        }).catch(() => {});
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [channelStatus?.status]);

  // Ações de Lifecycle do WhatsApp
  const handleConnectWhatsApp = async () => {
    // Hardening: reuse active session to avoid duplicate GPN sessions on repeated clicks/reload
    if (channelStatus?.status === 'AGUARDANDO_QR' && channelStatus.qrCode) {
      setSuccessMsg('QR Code já disponível. Escaneie com o WhatsApp.');
      setTimeout(() => setSuccessMsg(null), 4000);
      return;
    }
    try {
      setChannelLoading(true);
      const res = await api.connectWhatsApp();
      setChannelStatus(res);
      setSuccessMsg('Pareamento iniciado! Aponte a câmera do WhatsApp para o QR Code abaixo.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Erro ao conectar WhatsApp');
    } finally {
      setChannelLoading(false);
    }
  };

  const handleReconnectWhatsApp = async () => {
    try {
      setChannelLoading(true);
      const res = await api.reconnectWhatsApp();
      setChannelStatus(res);
      setSuccessMsg('Solicitação de reconexão enviada com sucesso.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao reconectar');
    } finally {
      setChannelLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm('Deseja realmente desconectar o número de WhatsApp desta organização?')) return;
    try {
      setChannelLoading(true);
      const res = await api.disconnectWhatsApp();
      setChannelStatus(res);
      setSuccessMsg('Canal de WhatsApp desconectado com sucesso.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao desconectar');
    } finally {
      setChannelLoading(false);
    }
  };

  const handleConfirmReplaceNumber = async () => {
    if (!replaceConfirm) {
      alert('Por favor, confirme que está ciente da substituição do aparelho.');
      return;
    }
    try {
      setChannelLoading(true);
      const res = await api.replaceWhatsAppNumber(true, replaceReason);
      setChannelStatus(res);
      setShowReplaceModal(false);
      setReplaceConfirm(false);
      setReplaceReason('');
      setSuccessMsg('Nova sessão preparada! Escaneie o novo QR Code com o novo aparelho.');
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      alert(err.message || 'Erro ao substituir número');
    } finally {
      setChannelLoading(false);
    }
  };

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

      // 2. Se for modo contingência Meta configurado manualmente
      if (showContingencyMeta) {
        await api.updateWhatsAppConnection({
          isMock,
          phoneNumberId,
          wabaId,
          accessToken: accessToken || undefined,
          appSecret: appSecret || undefined,
          webhookVerifyToken: webhookToken
        });
      }

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

  const isAccounting = settingsData?.organization.verticalProfile === 'ACCOUNTING';

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
              {isAccounting
                ? 'Gerencie o canal oficial do WhatsApp e parâmetros de atendimento contábil para igrejas.'
                : 'Gerencie parâmetros exclusivos de IA, mensageria e segurança para este tenant.'}
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

        {/* ========================================================================= */}
        {/* SEÇÃO 1: CANAL OFICIAL WHATSAPP (EXPERIÊNCIA LIMPA DE LIFECYCLE)          */}
        {/* ========================================================================= */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Canal Oficial WhatsApp</h2>
                <p className="text-xs text-slate-400">
                  Pareamento único via QR Code. O número conectado é exclusivo para a operação deste workspace.
                </p>
              </div>
            </div>

            {/* Badge de Status do Canal */}
            <div>
              {channelStatus?.status === 'CONECTADO' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  CONECTADO
                </span>
              )}
              {channelStatus?.status === 'AGUARDANDO_QR' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold">
                  <QrCode className="w-3.5 h-3.5" />
                  AGUARDANDO LEITURA DO QR
                </span>
              )}
              {channelStatus?.status === 'CONECTANDO' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  CONECTANDO...
                </span>
              )}
              {(!channelStatus || channelStatus.status === 'NAO_CONECTADO') && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-700 text-slate-300 border border-slate-600 text-xs font-semibold">
                  NÃO CONECTADO
                </span>
              )}
              {channelStatus?.status === 'DESCONECTADO' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-semibold">
                  DESCONECTADO
                </span>
              )}
              {channelStatus?.status === 'ERRO' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  ERRO OPERACIONAL
                </span>
              )}
            </div>
          </div>

          {/* Estado: CONECTADO */}
          {channelStatus?.status === 'CONECTADO' && (
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Número Conectado:</span>
                  <span className="text-base font-bold text-emerald-300 flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-emerald-400" />
                    {channelStatus.connectedPhone || 'Dispositivo Ativo'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Data da Conexão:</span>
                  <span className="text-slate-200 font-medium">
                    {channelStatus.connectedAt
                      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(channelStatus.connectedAt))
                      : 'Sessão Ativa'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Última Atividade:</span>
                  <span className="text-slate-200 font-medium">
                    {channelStatus.lastActivityAt
                      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(channelStatus.lastActivityAt))
                      : 'Agora'}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-emerald-800/30 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-emerald-300/80">
                  ✓ Sessão persistente ativa. Deploys e reinicializações normais preservam o pareamento automaticamente.
                </p>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleReconnectWhatsApp}
                    disabled={channelLoading}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-600 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${channelLoading ? 'animate-spin' : ''}`} />
                    Reconectar
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowReplaceModal(true)}
                    disabled={channelLoading}
                    className="px-3 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-medium border border-amber-600/40 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Substituir Número
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnectWhatsApp}
                    disabled={channelLoading}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-medium border border-rose-600/40 transition-all cursor-pointer"
                  >
                    Desconectar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Estado: AGUARDANDO QR CODE */}
          {channelStatus?.status === 'AGUARDANDO_QR' && (
            <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-6 text-center space-y-4">
              <div className="flex flex-col items-center justify-center space-y-2">
                <h3 className="text-sm font-bold text-blue-300 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-400" />
                  Escaneie o QR Code no WhatsApp da Yeshua
                </h3>
                <p className="text-xs text-slate-400 max-w-md">
                  1. Abra o WhatsApp no celular oficial.<br />
                  2. Toque em <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar um aparelho</strong>.<br />
                  3. Aponte a câmera para o código abaixo.
                </p>
              </div>

              {/* Box do QR Code */}
              <div className="inline-block p-4 bg-white rounded-2xl shadow-2xl">
                {channelStatus.qrCode?.startsWith('data:image') ? (
                  <img src={channelStatus.qrCode} alt="WhatsApp QR Code" className="w-52 h-52 mx-auto" />
                ) : channelStatus.qrCode ? (
                  <QRCodeSVG
                    value={channelStatus.qrCode}
                    size={208}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                    title="WhatsApp QR Code"
                  />
                ) : (
                  <div className="w-52 h-52 flex flex-col items-center justify-center text-center">
                    <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin mb-3" />
                    <span className="text-sm text-slate-600 font-medium">Gerando QR Code seguro...</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={loadSettings}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Já escaneei / Atualizar Status
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectWhatsApp}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Estado: NÃO CONECTADO / DESCONECTADO / ERRO */}
          {(!channelStatus || channelStatus.status === 'NAO_CONECTADO' || channelStatus.status === 'DESCONECTADO' || channelStatus.status === 'ERRO') && (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="text-sm font-semibold text-white flex items-center justify-center sm:justify-start gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  Conexão Direta do WhatsApp Oficial
                </h3>
                <p className="text-xs text-slate-400 max-w-lg">
                  Conecte o número de telefone oficial da Yeshua Contabilidade com pareamento único.
                  Mensagens recebidas são processadas automaticamente pela inteligência contábil.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConnectWhatsApp}
                disabled={channelLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all shrink-0 cursor-pointer disabled:opacity-50"
              >
                {channelLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <QrCode className="w-4 h-4" />
                )}
                Conectar WhatsApp
              </button>
            </div>
          )}

          {/* Link discreto para Provedor de Contingência Meta (Somente para uso técnico excepcional) */}
          {!isAccounting && (
            <div className="pt-2 border-t border-slate-700/40 flex justify-end">
              <button
                type="button"
                onClick={() => setShowContingencyMeta(!showContingencyMeta)}
                className="text-[11px] text-slate-500 hover:text-slate-300 underline"
              >
                {showContingencyMeta ? 'Ocultar Provedor de Contingência Meta' : 'Opções Avançadas de Contingência (Meta Cloud API)'}
              </button>
            </div>
          )}

          {showContingencyMeta && !isAccounting && (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/30 text-xs space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <AlertTriangle className="w-4 h-4" />
                Provedor de Contingência Excepcional (Meta Cloud API)
              </div>
              <p className="text-slate-400">
                Esta opção só deve ser ativada por decisão explícita e compliance técnico. Não há comutação automática silenciosa.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <input
                  type="text"
                  placeholder="Phone Number ID"
                  value={phoneNumberId}
                  onChange={e => setPhoneNumberId(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
                <input
                  type="text"
                  placeholder="WABA ID"
                  value={wabaId}
                  onChange={e => setWabaId(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO 2: INTELIGÊNCIA ARTIFICIAL & CONFIGURAÇÕES REGIONAIS                */}
        {/* ========================================================================= */}
        <form onSubmit={handleSaveAll} className="space-y-6">
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Inteligência Artificial & Triagem</h2>
                <p className="text-xs text-slate-400">
                  {isAccounting
                    ? 'Motor de decisão contábil eclesiástica, respostas com fundamentação legal e safety gate de fiscalização.'
                    : 'Defina o modelo de IA e chaves dedicadas para análise semântica e sugestão de acolhimento.'}
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
                  Instruções Específicas da Assessoria Contábil (Prompt Overrides)
                </label>
                <textarea
                  rows={3}
                  value={promptOverrides}
                  onChange={e => setPromptOverrides(e.target.value)}
                  placeholder="Ex: Reforçar o prazo de renovação do mandato de diretoria e solicitar número do recibo da última ECF..."
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
                <h2 className="text-base font-semibold text-white">Localização & Segurança</h2>
                <p className="text-xs text-slate-400">
                  Fuso horário padrão para registro de atendimentos e criptografia em repouso.
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
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>

        {/* ========================================================================= */}
        {/* MODAL DE CONFIRMAÇÃO: SUBSTITUIÇÃO DE NÚMERO                              */}
        {/* ========================================================================= */}
        {showReplaceModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center gap-3 text-amber-400">
                <ArrowRightLeft className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-white">Substituir Número de WhatsApp</h3>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200 space-y-2">
                <p className="font-semibold">
                  O número de WhatsApp é o canal da organização, não a sua identidade.
                </p>
                <p className="text-slate-300">
                  Ao substituir o número, todos os <strong>clientes, conversas, mensagens, pendências fiscais e histórico</strong> são <strong>preservados integralmente</strong>.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Motivo da Substituição (Opcional para auditoria)
                  </label>
                  <input
                    type="text"
                    value={replaceReason}
                    onChange={e => setReplaceReason(e.target.value)}
                    placeholder="Ex: Troca de chip institucional ou novo aparelho da diretoria"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceConfirm}
                    onChange={e => setReplaceConfirm(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-300">
                    Confirmo que desejo desconectar o aparelho atual e gerar um novo QR Code para parear o novo número oficial da Yeshua.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReplaceModal(false)}
                  disabled={channelLoading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmReplaceNumber}
                  disabled={channelLoading || !replaceConfirm}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {channelLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Confirmar e Gerar Novo QR
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
