import React, { useState, useEffect } from 'react';
import {
  Send,
  CheckCircle2,
  UserX,
  Sparkles,
  RefreshCw,
  Eye
} from 'lucide-react';
import { EventItem, CampaignItem } from '../types.js';
import { api } from '../services/api.js';

interface CampaignsViewProps {
  events: EventItem[];
  campaigns: CampaignItem[];
  preselectedEventId?: string | null;
  onRefresh: () => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  events,
  campaigns,
  preselectedEventId,
  onRefresh
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string>(
    preselectedEventId || (events.length > 0 ? events[0].id : '')
  );
  const [segmentType, setSegmentType] = useState<'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP'>('AUSENTE_FOLLOWUP');
  
  const defaultPresentTemplate = 'Olá, {{nome}}! Graça e Paz! Foi uma alegria imensa ter você conosco no {{evento}}. Obrigado pela sua presença e carinho! Que Deus abençoe sua semana!';
  const defaultAbsentTemplate = 'Olá, {{nome}}! Graça e Paz! Sentimos muito a sua falta no {{evento}}. Aconteceu alguma coisa? Está tudo bem por aí?';

  const [messageTemplate, setMessageTemplate] = useState(defaultAbsentTemplate);
  const [loading, setLoading] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<any | null>(null);

  useEffect(() => {
    if (preselectedEventId) {
      setSelectedEventId(preselectedEventId);
    }
  }, [preselectedEventId]);

  const handleSegmentChange = (type: 'PRESENTE_FOLLOWUP' | 'AUSENTE_FOLLOWUP') => {
    setSegmentType(type);
    if (type === 'PRESENTE_FOLLOWUP') {
      setMessageTemplate(defaultPresentTemplate);
    } else {
      setMessageTemplate(defaultAbsentTemplate);
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const audienceCount = selectedEvent
    ? (segmentType === 'PRESENTE_FOLLOWUP' ? selectedEvent.totalAttendees : selectedEvent.totalAbsentees)
    : 0;

  const handleDispatch = async () => {
    if (!selectedEventId || !messageTemplate) return;

    if (!confirm(`Confirma o disparo da campanha para os ${audienceCount} contatos (${segmentType === 'PRESENTE_FOLLOWUP' ? 'Presentes' : 'Ausentes'}) do evento "${selectedEvent?.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.dispatchCampaign({
        eventId: selectedEventId,
        type: segmentType,
        messageTemplate
      });
      setDispatchResult(res);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro no disparo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Campanhas & Disparos Pós-Evento</h2>
        <p className="text-xs text-slate-500">Comunique-se de forma personalizada com presentes e ausentes utilizando WhatsApp oficial e IA</p>
      </div>

      {/* Campaign Builder Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Preparar Nova Campanha Pós-Evento</h3>
              <p className="text-xs text-slate-500">Selecione o evento e customize a mensagem</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Coluna 1: Seleção de Evento e Segmento */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Selecione o Evento</label>
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium"
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({ev.totalAttendees} presentes, {ev.totalAbsentees} ausentes)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Segmento Alvo</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSegmentChange('AUSENTE_FOLLOWUP')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    segmentType === 'AUSENTE_FOLLOWUP'
                      ? 'border-rose-500 bg-rose-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                    <UserX className="w-4 h-4 text-rose-600" />
                    AUSENTES
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {selectedEvent ? selectedEvent.totalAbsentees : 0} contatos
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSegmentChange('PRESENTE_FOLLOWUP')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    segmentType === 'PRESENTE_FOLLOWUP'
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    PRESENTES
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {selectedEvent ? selectedEvent.totalAttendees : 0} contatos
                  </div>
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">Tags de Personalização Disponíveis:</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <code className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[11px]">&#123;&#123;nome&#125;&#125;</code>
                <code className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[11px]">&#123;&#123;evento&#125;&#125;</code>
                <code className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[11px]">&#123;&#123;data&#125;&#125;</code>
              </div>
            </div>
          </div>

          {/* Coluna 2: Editor de Mensagem e Prévia */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Mensagem do Template</label>
              <span className="text-[11px] text-slate-400">Suporte a WhatsApp Formatting</span>
            </div>

            <textarea
              rows={5}
              value={messageTemplate}
              onChange={e => setMessageTemplate(e.target.value)}
              className="w-full px-3 py-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-sans"
            ></textarea>

            {/* Preview do Balão */}
            <div className="p-3.5 bg-whatsapp-chatbg/40 rounded-xl border border-slate-200">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> Prévia no Celular do Participante
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm max-w-sm text-xs text-slate-800 leading-relaxed border border-slate-100">
                {messageTemplate
                  .replace(/{{nome}}/g, 'Mariana')
                  .replace(/{{evento}}/g, selectedEvent?.name || 'Culto de Celebração')
                  .replace(/{{data}}/g, '23/08/2026')}
                <div className="text-right text-[10px] text-slate-400 mt-1">20:15 ✓✓</div>
              </div>
            </div>
          </div>
        </div>

        {/* Botão de Disparo */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Total a ser disparado: <strong className="text-slate-900">{audienceCount} contatos</strong>
          </div>

          <button
            onClick={handleDispatch}
            disabled={loading || audienceCount === 0}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Disparando Mensagens...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Executar Pós-Evento ({audienceCount})
              </>
            )}
          </button>
        </div>

        {/* Resultado do Disparo */}
        {dispatchResult && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
            <div className="font-bold text-emerald-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Campanha disparada com sucesso!
            </div>
            <div className="grid grid-cols-3 gap-2 text-slate-700">
              <div>• Total Alvos: <strong>{dispatchResult.totalRecipients}</strong></div>
              <div>• Enviadas com Sucesso: <strong className="text-emerald-700">{dispatchResult.totalSent}</strong></div>
              <div>• Falhas: <strong className="text-rose-700">{dispatchResult.totalFailed}</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* Histórico de Campanhas */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Histórico de Campanhas Disparadas</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="py-2.5 px-3">Nome da Campanha</th>
                <th className="py-2.5 px-3">Evento</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Destinatários</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {campaigns.map(camp => (
                <tr key={camp.id} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{camp.name}</td>
                  <td className="py-2.5 px-3">{camp.event?.name || 'Evento'}</td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      camp.type === 'PRESENTE_FOLLOWUP' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {camp.type === 'PRESENTE_FOLLOWUP' ? 'PRESENTES' : 'AUSENTES'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-semibold">{camp.totalSent}</span> / {camp.totalRecipients}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {camp.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(camp.createdAt))}
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400 italic">
                    Nenhuma campanha disparada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
