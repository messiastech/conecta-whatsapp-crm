import React from 'react';
import {
  Users,
  CalendarCheck,
  Send,
  MessageSquareReply,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Ban,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';
import { DashboardMetrics } from '../types.js';

interface DashboardViewProps {
  metrics: DashboardMetrics | null;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ metrics, onNavigate }) => {
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Carregando métricas consolidadas do CRM...
      </div>
    );
  }

  const isAccounting = metrics.verticalProfile === 'ACCOUNTING';

  const categoryColors: Record<string, string> = {
    // Accounting Vertical Categories
    REFORMA_TRIBUTARIA: 'bg-indigo-500',
    MEI: 'bg-amber-500',
    NOTA_FISCAL: 'bg-rose-500',
    IMUNIDADE_TEMPLO: 'bg-emerald-500',
    CASO_COMPLEXO: 'bg-red-600',
    FALAR_CONTADOR: 'bg-blue-600',
    GERAL_CONTABIL: 'bg-teal-500',
    // Default Pastoral Categories
    TRABALHO: 'bg-blue-500',
    SAUDE: 'bg-rose-500',
    FAMILIA: 'bg-amber-500',
    VIAGEM: 'bg-emerald-500',
    COMPROMISSO: 'bg-indigo-500',
    ESQUECIMENTO: 'bg-purple-500',
    FALTA_INFORMACAO: 'bg-pink-500',
    TRANSPORTE_LOGISTICA: 'bg-teal-500',
    DESINTERESSE: 'bg-slate-500',
    PEDIDO_ATENDIMENTO: 'bg-red-600',
    OUTRO: 'bg-slate-400',
    INCONCLUSIVO: 'bg-slate-300'
  };

  const categoryLabels: Record<string, string> = {
    REFORMA_TRIBUTARIA: 'Reforma Tributária & Simples',
    MEI: 'MEI & Desenquadramento',
    NOTA_FISCAL: 'Emissão de Nota Fiscal & Retenções',
    IMUNIDADE_TEMPLO: 'Igrejas & Terceiro Setor',
    CASO_COMPLEXO: 'Caso Complexo / Fiscalização',
    FALAR_CONTADOR: 'Falar com Contador Responsável',
    GERAL_CONTABIL: 'Dúvida Geral / Rotina',
    TRABALHO: 'Trabalho / Escala',
    SAUDE: 'Saúde / Doença',
    FAMILIA: 'Família / Filhos',
    VIAGEM: 'Viagem / Férias',
    COMPROMISSO: 'Outro Compromisso',
    ESQUECIMENTO: 'Esquecimento',
    FALTA_INFORMACAO: 'Falta de Informação',
    TRANSPORTE_LOGISTICA: 'Transporte / Logística',
    DESINTERESSE: 'Sem Interesse',
    PEDIDO_ATENDIMENTO: 'Pedido de Atendimento / Oração',
    OUTRO: 'Outro Motivo',
    INCONCLUSIVO: 'Inconclusivo / Em Análise'
  };

  const priorityColors: Record<string, { bg: string; text: string }> = {
    URGENT: { bg: 'bg-red-100 text-red-800 border-red-200', text: isAccounting ? 'Urgente (Prazo Fiscal / Auditoria)' : 'Urgente (Crise / Oração)' },
    HIGH: { bg: 'bg-rose-100 text-rose-800 border-rose-200', text: isAccounting ? 'Alta (Nota Fiscal / CND)' : 'Alta (Saúde / Luto)' },
    MEDIUM: { bg: 'bg-amber-100 text-amber-800 border-amber-200', text: isAccounting ? 'Média (MEI / Simples)' : 'Média (Família / Dúvidas)' },
    LOW: { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', text: isAccounting ? 'Baixa (Rotina / Folha)' : 'Baixa (Rotina / Trabalho)' }
  };

  const totalClassified = metrics.categoryBreakdown.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="space-y-6">
      {/* Header com Resumo do Modo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {isAccounting ? 'Dashboard de Atendimento & Gestão para Igrejas' : 'Dashboard de Relacionamento Comunitário'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isAccounting
              ? 'Métricas operacionais, SLA de resposta e triagem contábil/fiscal especializada para igrejas'
              : 'Métricas unificadas e inteligência de acolhimento pós-evento'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAccounting ? (
            <>
              <button
                onClick={() => onNavigate('persons')}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              >
                Ver Igrejas & Clientes
              </button>
              <button
                onClick={() => onNavigate('conversations')}
                className="px-3.5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition-colors flex items-center gap-1.5"
              >
                <MessageSquareReply className="w-3.5 h-3.5" /> Central de Atendimentos
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onNavigate('events')}
                className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
              >
                Ver Eventos
              </button>
              <button
                onClick={() => onNavigate('campaigns')}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Nova Campanha
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Igrejas na Carteira / Presença */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isAccounting ? 'Igrejas na Carteira' : 'Taxa de Presença'}
            </span>
            <div className={`w-8 h-8 rounded-lg ${isAccounting ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'} flex items-center justify-center`}>
              {isAccounting ? <Users className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {isAccounting ? metrics.totalPersons : `${metrics.presenceRate}%`}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              {isAccounting ? (
                <span className="font-semibold text-indigo-700">{metrics.totalPersons} igrejas ativas na carteira</span>
              ) : (
                <>
                  <span className="font-semibold text-emerald-700">{metrics.totalPresent} presentes</span>
                  <span>/ {metrics.totalPresent + metrics.totalAbsent} esperados</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Atendimentos com IA / Taxa Real de Resposta */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {isAccounting ? 'Atendimentos com IA' : 'Taxa de Resposta'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <MessageSquareReply className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {isAccounting ? (metrics.totalMessagesReceived || 0) : `${metrics.responseRate}%`}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              {isAccounting ? (
                <>
                  <span className="font-semibold text-blue-700">{metrics.uniqueRespondersCount || metrics.totalMessagesReceived} conversas</span>
                  <span>com triagem automatizada</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-blue-700">{metrics.uniqueRespondersCount || metrics.totalMessagesReceived} contatos</span>
                  <span>responderam</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Triagem & Alertas */}
        <div
          onClick={() => onNavigate('conversations')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-rose-300 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-rose-600">
              {isAccounting ? 'Alertas & Atenção Técnica' : 'Atenção Pastoral'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-600">{metrics.pendingAttentionCount}</div>
            <div className="text-xs text-slate-500 mt-1">
              {isAccounting ? 'Atendimentos sinalizados para contador ou urgência fiscal' : 'Conversas sinalizadas para acolhimento humano'}
            </div>
          </div>
        </div>

        {/* Card 4: Pendências Tributárias/Cartoriais */}
        <div
          onClick={() => onNavigate('tasks')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-amber-600">
              {isAccounting ? 'Pendências Tributárias/Cartoriais' : 'Tarefas Pendentes'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-600">{metrics.pendingFollowUpsCount}</div>
            <div className="text-xs text-slate-500 mt-1">
              {isAccounting ? 'Pendências fiscais, estatutárias e cartoriais de igrejas' : 'Acompanhamentos gerados pela triagem de IA'}
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Análise Semântica e Prioridades */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Motivos de Ausência / Categorias Tributárias */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isAccounting ? 'Classificação de Atendimentos por IA' : 'Classificação de Ausências por IA'}
              </h3>
              <p className="text-xs text-slate-500">
                {isAccounting ? 'Distribuição das solicitações e dúvidas fiscais triadas' : 'Distribuição semântica dos motivos identificados nas respostas'}
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500 px-2.5 py-1 bg-slate-100 rounded-lg">
              {totalClassified} respostas analisadas
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {metrics.categoryBreakdown.map((item) => {
              const percentage = totalClassified > 0 ? ((item.count / totalClassified) * 100).toFixed(0) : '0';
              const colorClass = categoryColors[item.category] || 'bg-slate-400';
              const label = categoryLabels[item.category] || item.category;

              return (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{label}</span>
                    <span className="text-slate-500 font-mono">
                      <strong>{item.count}</strong> ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colorClass} rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}

            {metrics.categoryBreakdown.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs italic">
                {isAccounting ? 'Nenhum atendimento classificado ainda.' : 'Nenhuma resposta classificada ainda.'}
              </div>
            )}
          </div>
        </div>

        {/* Painel Direito: Prioridades & SLAs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Matriz de Prioridade */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {isAccounting ? 'Triagem de Criticidade Fiscal & SLA' : 'Triagem de Prioridade Pastoral'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAccounting ? 'Classificação por risco fiscal e urgência de atendimento' : 'Diferenciação rigorosa: Sentimento ≠ Prioridade'}
            </p>

            <div className="space-y-2.5 pt-1">
              {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((pKey) => {
                const found = metrics.priorityBreakdown.find(p => p.priority === pKey);
                const count = found ? found.count : 0;
                const info = priorityColors[pKey];

                return (
                  <div
                    key={pKey}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${info.bg}`}
                  >
                    <span className="font-bold">{info.text}</span>
                    <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-white/70 shadow-xs">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card de Governança LGPD */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Conformidade LGPD & Consentimento
              </div>
              <p className="text-xs text-slate-500">
                {metrics.totalOptOuts} contatos exerceram opt-out (bloqueio automático de disparos)
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                {metrics.totalOptOuts} Opt-Outs
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
