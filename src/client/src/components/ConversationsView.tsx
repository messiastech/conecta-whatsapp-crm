import React, { useState } from 'react';
import {
  MessageSquare,
  Sparkles,
  Send,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Tag,
  Zap,
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  RotateCw
} from 'lucide-react';
import { ConversationItem } from '../types.js';
import { api } from '../services/api.js';

interface ConversationsViewProps {
  conversations: ConversationItem[];
  onRefresh: () => void;
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  conversations,
  onRefresh
}) => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    conversations.length > 0 ? conversations[0].id : null
  );
  const [replyText, setReplyText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  const filteredConversations = conversations.filter(c => {
    if (filterPriority === 'ALL') return true;
    return c.priority === filterPriority;
  });

  const selectedConversation = conversations.find(c => c.id === selectedConvId) || conversations[0];

  const handleSendReply = async () => {
    if (!selectedConversation || !replyText.trim()) return;

    try {
      setSending(true);
      await api.replyConversation(selectedConversation.id, replyText);
      setReplyText('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar resposta');
      onRefresh();
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async (messageId: string) => {
    if (!selectedConversation) return;
    try {
      setRetryingId(messageId);
      await api.retryMessage(selectedConversation.id, messageId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Falha ao tentar reenviar mensagem');
      onRefresh();
    } finally {
      setRetryingId(null);
    }
  };

  const handleApplySuggestion = (suggestion: string) => {
    setReplyText(suggestion);
  };

  const priorityBadges: Record<string, { bg: string; text: string }> = {
    URGENT: { bg: 'bg-red-600 text-white', text: 'URGENTE' },
    HIGH: { bg: 'bg-rose-500 text-white', text: 'ALTA' },
    MEDIUM: { bg: 'bg-amber-500 text-white', text: 'MÉDIA' },
    LOW: { bg: 'bg-emerald-600 text-white', text: 'BAIXA' }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Central de Conversas & Triagem Inteligente</h2>
          <p className="text-xs text-slate-500">
            Supervisão humana de respostas, classificação semântica e acolhimento pastoral
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Filtrar por Prioridade:</span>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white font-medium text-slate-700 outline-none"
          >
            <option value="ALL">Todas as Prioridades</option>
            <option value="URGENT">Urgente (Crise / Oração)</option>
            <option value="HIGH">Alta (Saúde / Luto)</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista de Conversas (Esquerda) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[640px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Conversas Recentes ({filteredConversations.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              const lastAi = conv.aiAnalyses?.[0];
              const pBadge = priorityBadges[conv.priority] || priorityBadges.MEDIUM;

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedConvId(conv.id);
                    if (lastAi?.suggestedReply) {
                      setReplyText(lastAi.suggestedReply);
                    }
                  }}
                  className={`w-full p-4 text-left transition-colors flex flex-col gap-2 ${
                    isSelected ? 'bg-emerald-50/60 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 truncate">
                      {conv.person?.name || 'Participante'}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${pBadge.bg}`}>
                      {pBadge.text}
                    </span>
                  </div>

                  {lastAi && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                        {lastAi.category}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {lastAi.sentiment}
                      </span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 line-clamp-1 italic">
                    {conv.messages?.[conv.messages.length - 1]?.content || 'Sem mensagens recentes'}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{conv.person?.normalizedPhone}</span>
                    <span>
                      {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(conv.lastMessageAt))}
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredConversations.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs italic">
                Nenhuma conversa encontrada.
              </div>
            )}
          </div>
        </div>

        {/* Painel Central: Chat e Acolhimento Human-in-the-Loop */}
        <div className="lg:col-span-8 space-y-4">
          {selectedConversation ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[640px] overflow-hidden">
              {/* Top Bar da Conversa */}
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    {selectedConversation.person?.name?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      {selectedConversation.person?.name}
                    </h3>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {selectedConversation.person?.normalizedPhone}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedConversation.person?.optOut && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Bloqueado (Opt-Out)
                    </span>
                  )}

                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${priorityBadges[selectedConversation.priority]?.bg || 'bg-slate-600 text-white'}`}>
                    Prioridade {selectedConversation.priority}
                  </span>
                </div>
              </div>

              {/* Análise de IA Fixada no Topo do Chat */}
              {selectedConversation.aiAnalyses?.[0] && (
                <div className="bg-indigo-50/80 border-b border-indigo-100 p-4 space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Triagem de IA ({selectedConversation.aiAnalyses[0].category})
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-200 text-indigo-900 font-mono font-bold rounded">
                      {(selectedConversation.aiAnalyses[0].confidence * 100).toFixed(0)}% confiança
                    </span>
                  </div>

                  <p className="text-xs text-slate-700">
                    <strong>Resumo:</strong> {selectedConversation.aiAnalyses[0].summary}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-600">
                    <span><strong>Sentimento:</strong> {selectedConversation.aiAnalyses[0].sentiment}</span>
                    <span><strong>Urgência:</strong> {selectedConversation.aiAnalyses[0].urgency}</span>
                    <span><strong>Próxima Ação:</strong> {selectedConversation.aiAnalyses[0].nextAction}</span>
                  </div>

                  {selectedConversation.aiAnalyses[0].suggestedReply && (
                    <div className="pt-2 flex items-center justify-between bg-white p-2.5 rounded-xl border border-indigo-100 gap-3">
                      <div className="text-xs text-slate-700 italic line-clamp-2">
                        "{selectedConversation.aiAnalyses[0].suggestedReply}"
                      </div>
                      <button
                        onClick={() => handleApplySuggestion(selectedConversation.aiAnalyses![0].suggestedReply!)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shrink-0 transition-colors flex items-center gap-1 shadow-xs"
                      >
                        <Zap className="w-3 h-3" /> Usar Sugestão
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Histórico de Mensagens */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
                {selectedConversation.messages?.map((msg) => {
                  const isOutbound = msg.direction === 'OUTBOUND';
                  const isFailed = isOutbound && msg.status === 'FAILED';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                    >
                      {isFailed ? (
                        <div className="max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm bg-rose-950/30 border border-rose-500/50 text-rose-100 rounded-tr-none space-y-2">
                          <p className="whitespace-pre-wrap text-slate-100">{msg.content}</p>

                          {msg.errorMessage && (
                            <p className="text-[10px] text-rose-300 italic bg-rose-500/10 p-1.5 rounded-lg border border-rose-500/20 break-words">
                              Erro: {msg.errorMessage}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-rose-500/30 text-[10px]">
                            <span className="flex items-center gap-1 font-bold text-rose-400">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              Não entregue
                            </span>

                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">
                                {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(msg.createdAt))}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRetry(msg.id)}
                                disabled={retryingId === msg.id}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <RotateCw className={`w-3 h-3 ${retryingId === msg.id ? 'animate-spin' : ''}`} />
                                {retryingId === msg.id ? 'Reenviando...' : 'Tentar novamente'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`max-w-[75%] p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                            isOutbound
                              ? 'bg-emerald-600 text-white rounded-tr-none'
                              : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <div
                            className={`text-[9px] mt-1 text-right flex items-center justify-end gap-1 ${
                              isOutbound ? 'text-emerald-100' : 'text-slate-400'
                            }`}
                          >
                            <span>
                              {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(msg.createdAt))}
                            </span>
                            {isOutbound && (
                              msg.status === 'READ' ? (
                                <span title="Lida pelo destinatário" className="inline-flex items-center">
                                  <CheckCheck className="w-3.5 h-3.5 text-cyan-200" />
                                </span>
                              ) : msg.status === 'DELIVERED' ? (
                                <span title="Entregue ao aparelho" className="inline-flex items-center">
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-200" />
                                </span>
                              ) : msg.status === 'SENT' ? (
                                <span title="Enviada ao WhatsApp" className="inline-flex items-center">
                                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                                </span>
                              ) : (
                                <span title="Na fila de envio" className="inline-flex items-center">
                                  <Clock className="w-3 h-3 text-emerald-200 animate-pulse" />
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Barra de Resposta Humana com Supervisão */}
              <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
                <textarea
                  placeholder="Escreva uma resposta de acolhimento pastoral..."
                  rows={2}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                />
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim() || selectedConversation.person?.optOut}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 h-full shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              Selecione uma conversa ao lado para visualizar e acolher o participante.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
