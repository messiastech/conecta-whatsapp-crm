import React from 'react';
import {
  Users,
  Calendar,
  Send,
  MessageSquare,
  AlertTriangle,
  HeartPulse,
  TrendingUp,
  UserX,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { DashboardMetrics } from '../types.js';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  onNavigate: (tab: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  TRABALHO: 'bg-blue-500',
  SAUDE: 'bg-red-500',
  FAMILIA: 'bg-amber-500',
  VIAGEM: 'bg-emerald-500',
  COMPROMISSO: 'bg-indigo-500',
  ESQUECIMENTO: 'bg-purple-500',
  FALTA_INFORMACAO: 'bg-pink-500',
  TRANSPORTE_LOGISTICA: 'bg-teal-500',
  DESINTERESSE: 'bg-slate-500',
  PEDIDO_ATENDIMENTO: 'bg-rose-600',
  OUTRO: 'bg-gray-500',
  INCONCLUSIVO: 'bg-gray-400'
};

const CATEGORY_LABELS: Record<string, string> = {
  TRABALHO: 'Trabalho / Plantão',
  SAUDE: 'Saúde / Doença',
  FAMILIA: 'Família / Filhos',
  VIAGEM: 'Viagem / Férias',
  COMPROMISSO: 'Outro Compromisso',
  ESQUECIMENTO: 'Esquecimento',
  FALTA_INFORMACAO: 'Falta de Informação',
  TRANSPORTE_LOGISTICA: 'Transporte / Chuva',
  DESINTERESSE: 'Desânimo / Desinteresse',
  PEDIDO_ATENDIMENTO: 'Pedido de Oração / Ajuda',
  OUTRO: 'Outro Motivo',
  INCONCLUSIVO: 'Não Identificado'
};

export const DashboardView: React.FC<DashboardViewProps> = ({ metrics, onNavigate }) => {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const totalClassified = metrics.categoryBreakdown.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner Alert se houver casos de atenção */}
      {metrics.pendingAttentionCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                {metrics.pendingAttentionCount} {metrics.pendingAttentionCount === 1 ? 'conversa requer' : 'conversas requerem'} atenção pastoral prioritária
              </h4>
              <p className="text-xs text-amber-700">
                Participantes manifestaram motivos de saúde grave, pedidos de oração ou desânimo.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('conversations')}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
          >
            Ver Conversas <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total de Contatos</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{metrics.totalPersons}</span>
            <span className="text-xs text-slate-500 ml-2">pessoas cadastradas</span>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-600 border-t border-slate-100 pt-2">
            <span className="flex items-center gap-1 text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> {metrics.totalPresent} presentes
            </span>
            <span className="flex items-center gap-1 text-rose-600 font-medium">
              <UserX className="w-3.5 h-3.5" /> {metrics.totalAbsent} ausentes
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Eventos Realizados</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{metrics.totalEvents}</span>
            <span className="text-xs text-slate-500 ml-2">encontros registrados</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-2 flex items-center justify-between">
            <span>Campanhas pós-evento</span>
            <span className="font-semibold text-slate-800">{metrics.totalCampaigns} criadas</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mensagens Enviadas</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{metrics.totalMessagesSent}</span>
            <span className="text-xs text-slate-500 ml-2">disparos WhatsApp</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-2 flex items-center justify-between">
            <span>Respostas recebidas</span>
            <span className="font-semibold text-indigo-600">{metrics.totalMessagesReceived}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Taxa de Resposta</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-purple-700">{metrics.responseRate}%</span>
            <span className="text-xs text-slate-500 ml-2">engajamento médio</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 border-t border-slate-100 pt-2 flex items-center justify-between">
            <span>Descadastros (Opt-Outs)</span>
            <span className="font-semibold text-slate-700">{metrics.totalOptOuts}</span>
          </div>
        </div>
      </div>

      {/* Motivos de Ausência Interpretados por IA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Distribuição de Motivos de Ausência (IA)</h3>
              <p className="text-xs text-slate-500">Classificação semântica automatizada das respostas recebidas via WhatsApp</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
              {totalClassified} respostas analisadas
            </span>
          </div>

          {metrics.categoryBreakdown.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Nenhuma resposta de ausência classificada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {metrics.categoryBreakdown.map(item => {
                const percentage = totalClassified > 0 ? ((item.count / totalClassified) * 100).toFixed(0) : '0';
                const color = CATEGORY_COLORS[item.category] || 'bg-slate-400';
                const label = CATEGORY_LABELS[item.category] || item.category;

                return (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
                        {label}
                      </span>
                      <span className="text-slate-500 font-semibold">{item.count} ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} transition-all duration-500 rounded-full`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions & Flow */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Ações Rápidas</h3>
            <p className="text-xs text-slate-500 mb-4">Fluxo completo de relacionamento pós-evento</p>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('events')}
                className="w-full p-3 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left flex items-center justify-between group"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">1. Importar Presença</div>
                  <div className="text-[11px] text-slate-500">Upload de planilha CSV/XLSX</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
              </button>

              <button
                onClick={() => onNavigate('campaigns')}
                className="w-full p-3 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left flex items-center justify-between group"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">2. Disparar Pós-Evento</div>
                  <div className="text-[11px] text-slate-500">Enviar mensagens para presentes e ausentes</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
              </button>

              <button
                onClick={() => onNavigate('conversations')}
                className="w-full p-3 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left flex items-center justify-between group"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">3. Central de Conversas & IA</div>
                  <div className="text-[11px] text-slate-500">Revisar e aprovar sugestões da IA</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
              </button>

              <button
                onClick={() => onNavigate('sandbox')}
                className="w-full p-3 rounded-lg border border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100 transition-all text-left flex items-center justify-between group"
              >
                <div>
                  <div className="text-xs font-bold text-emerald-900">4. Simulador WhatsApp</div>
                  <div className="text-[11px] text-emerald-700">Testar envio e resposta em tempo real</div>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-700" />
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Acolhimento pastoral humanizado com supervisão em 3 níveis.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
