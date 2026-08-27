import React, { useState } from 'react';
import {
  MessageSquare,
  AlertTriangle,
  Send,
  User,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  HeartPulse
} from 'lucide-react';
import { ConversationItem } from '../types.js';
import { api } from '../services/api.js';

interface ConversationsViewProps {
  conversations: ConversationItem[];
  onRefresh: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  TRABALHO: { label: 'Trabalho / Plantão', bg: 'bg-blue-100', text: 'text-blue-800' },
  SAUDE: { label: 'Saúde / Doença', bg: 'bg-red-100', text: 'text-red-800' },
  FAMILIA: { label: 'Família / Filhos', bg: 'bg-amber-100', text: 'text-amber-800' },
  VIAGEM: { label: 'Viagem / Férias', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  COMPROMISSO: { label: 'Outro Compromisso', bg: 'bg-indigo-100', text: 'text-indigo-800' },
  ESQUECIMENTO: { label: 'Esquecimento', bg: 'bg-purple-100', text: 'text-purple-800' },
  FALTA_INFORMACAO: { label: 'Falta de Informação', bg: 'bg-pink-100', text: 'text-pink-800' },
  TRANSPORTE_LOGISTICA: { label: 'Transporte / Chuva', bg: 'bg-teal-100', text: 'text-teal-800' },
  DESINTERESSE: { label: 'Desânimo / Desinteresse', bg: 'bg-slate-200', text: 'text-slate-800' },
  PEDIDO_ATENDIMENTO: { label: 'Pedido de Oração / Ajuda', bg: 'bg-rose-100', text: 'text-rose-900 font-bold animate-pulse' },
  OUTRO: { label: 'Outro Motivo', bg: 'bg-gray-100', text: 'text-gray-800' },
  INCONCLUSIVO: { label: 'Não Identificado', bg: 'bg-gray-100', text: 'text-gray-600' }
};

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  conversations,
  onRefresh
}) => {
  const [selectedConversationId, setSelectedConversationId] = useState<string>(
    conversations.length > 0 ? conversations[0].id : ''
  );
  const [filterAttention, setFilterAttention] = useState<boolean>(false);
  const [replyText, setReplyText] = useState<string>('');
  const [sending, setSending] = useState(false);

  const filteredConversations = filterAttention
    ? conversations.filter(c => c.requiresHumanAttention)
    : conversations;

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || conversations[0];

  // Identifica a análise de IA mais recente da conversa
  const latestAIAnalysis = selectedConversation?.messages
    ?.flatMap(m => m.aiAnalyses || [])
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const handleUseSuggestedReply = () => {
    if (latestAIAnalysis?.suggestedReply) {
      setReplyText(latestAIAnalysis.suggestedReply);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;

    try {
      setSending(true);
      await api.replyConversation(selectedConversation.id, replyText);
      setReplyText('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar resposta');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      {/* Top Filter Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Central de Conversas & Acolhimento com IA</h2>
          <p className="text-xs text-slate-500">Acompanhe respostas do WhatsApp, motivos classificados e sugestões supervisionadas</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterAttention(!filterAttention)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              filterAttention
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Requer Atenção Pastoral
          </button>
          <button
            onClick={onRefresh}
            className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 overflow-hidden min-h-0">
        {/* Left Column: Conversation List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <span className="text-xs font-bold text-slate-700">
              Conversas ({filteredConversations.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.map(conv => {
              const isSelected = conv.id === selectedConversation?.id;
              const lastMsg = conv.messages?.[conv.messages.length - 1];
              const categoryInfo = conv.category ? CATEGORY_LABELS[conv.category] : null;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setSelectedConversationId(conv.id);
                    const ai = conv.messages
                      ?.flatMap(m => m.aiAnalyses || [])
                      ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                    if (ai?.suggestedReply) {
                      setReplyText(ai.suggestedReply);
                    }
                  }}
                  className={`p-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-emerald-50/70 border-l-4 border-emerald-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-bold text-xs text-slate-900 truncate">
                      {conv.person?.name || 'Participante'}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(conv.lastMessageAt))}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-1 mb-2">
                    {lastMsg ? lastMsg.content : 'Nenhuma mensagem'}
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {conv.requiresHumanAttention && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Atenção
                      </span>
                    )}

                    {categoryInfo && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${categoryInfo.bg} ${categoryInfo.text}`}>
                        {categoryInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredConversations.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                Nenhuma conversa encontrada.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chat History + AI Insights Panel */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Header do Chat */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{selectedConversation.person?.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">{selectedConversation.person?.normalizedPhone}</p>
                  </div>
                </div>

                {selectedConversation.requiresHumanAttention && (
                  <span className="px-3 py-1 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-rose-600" />
                    Intervenção Pastoral Recomendada
                  </span>
                )}
              </div>

              {/* Mensagens & Análise de IA */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-whatsapp-chatbg/20">
                {selectedConversation.messages?.map(msg => {
                  const isOutbound = msg.direction === 'OUTBOUND';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                          isOutbound
                            ? 'bg-emerald-600 text-white rounded-tr-none'
                            : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                        }`}
                      >
                        <p>{msg.content}</p>
                        <div className={`text-[10px] mt-1 text-right ${isOutbound ? 'text-emerald-100' : 'text-slate-400'}`}>
                          {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(msg.createdAt))}
                          {isOutbound && ' ✓✓'}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Card de Análise de IA em Destaque */}
                {latestAIAnalysis && (
                  <div className="mt-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Classificação Cognitiva da IA
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-200/60 text-indigo-900 rounded font-mono font-semibold">
                        {(latestAIAnalysis.confidence * 100).toFixed(0)}% confiança ({latestAIAnalysis.modelUsed})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Motivo: </span>
                        <span className="font-bold text-slate-800">
                          {CATEGORY_LABELS[latestAIAnalysis.category]?.label || latestAIAnalysis.category}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Sentimento: </span>
                        <span className="font-semibold text-slate-800">{latestAIAnalysis.sentiment}</span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 bg-white/80 p-2.5 rounded-lg border border-indigo-100">
                      <strong>Resumo:</strong> {latestAIAnalysis.summary}
                    </div>

                    {latestAIAnalysis.suggestedReply && (
                      <div className="pt-2 border-t border-indigo-100">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-indigo-950">Sugestão de Resposta Pastoral:</span>
                          <button
                            type="button"
                            onClick={handleUseSuggestedReply}
                            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Usar esta sugestão
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded-lg border border-slate-200">
                          "{latestAIAnalysis.suggestedReply}"
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Barra de Envio de Resposta (Human-in-the-Loop) */}
              <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
                <input
                  type="text"
                  placeholder="Digite uma resposta acolhedora ou use a sugestão da IA acima..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" /> {sending ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400 italic">
              Selecione uma conversa ao lado para visualizar os detalhes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
