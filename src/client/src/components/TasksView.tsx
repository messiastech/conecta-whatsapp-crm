import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  User,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { FollowUpTaskItem } from '../types.js';
import { api } from '../services/api.js';

interface TasksViewProps {
  onRefresh: () => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ onRefresh }) => {
  const [tasks, setTasks] = useState<FollowUpTaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await api.getTasks(statusFilter === 'ALL' ? undefined : statusFilter);
      setTasks(data);
    } catch (err) {
      console.error('Erro ao carregar tarefas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [statusFilter]);

  const handleToggleTask = async (task: FollowUpTaskItem) => {
    try {
      const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
      await api.updateTaskStatus(task.id, nextStatus);
      loadTasks();
      onRefresh();
    } catch (err) {
      alert('Erro ao atualizar tarefa');
    }
  };

  const filteredTasks = tasks.filter(t => {
    return (
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.person?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const priorityStyles: Record<string, { bg: string; text: string; badge: string }> = {
    URGENT: { bg: 'bg-red-50 border-red-200', text: 'text-red-900', badge: 'bg-red-600 text-white' },
    HIGH: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-900', badge: 'bg-rose-600 text-white' },
    MEDIUM: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-900', badge: 'bg-amber-600 text-white' },
    LOW: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-800', badge: 'bg-slate-500 text-white' }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Acompanhamentos Pastorais & Tarefas</h2>
          <p className="text-xs text-slate-500">
            Encaminhamentos gerados pela triagem de IA para intervenção humana (oração, saúde, acolhimento)
          </p>
        </div>

        <button
          onClick={loadTasks}
          className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Buscar por participante ou motivo do acompanhamento..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-slate-700"
          >
            <option value="PENDING">Pendentes</option>
            <option value="COMPLETED">Concluídas</option>
            <option value="ALL">Todas as Tarefas</option>
          </select>
        </div>
      </div>

      {/* Task Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTasks.map((task) => {
          const style = priorityStyles[task.priority] || priorityStyles.MEDIUM;
          const isDone = task.status === 'COMPLETED';

          return (
            <div
              key={task.id}
              className={`p-5 rounded-2xl border transition-all ${
                isDone ? 'bg-slate-50 border-slate-200 opacity-70' : style.bg
              } shadow-sm space-y-3 flex flex-col justify-between`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                    {task.priority === 'URGENT' ? 'URGENTE' : `PRIORIDADE ${task.priority}`}
                  </span>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.createdAt))}
                  </span>
                </div>

                <h3 className={`text-sm font-bold ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                  {task.title}
                </h3>

                {task.description && (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {task.description}
                  </p>
                )}

                {task.person && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium pt-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{task.person.name} ({task.person.phone})</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${isDone ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {isDone ? '✓ Acompanhamento Realizado' : 'Ação Humana Pendente'}
                </span>

                <button
                  onClick={() => handleToggleTask(task)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                    isDone
                      ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  }`}
                >
                  {isDone ? 'Reabrir Tarefa' : 'Concluir Acompanhamento'}
                </button>
              </div>
            </div>
          );
        })}

        {filteredTasks.length === 0 && (
          <div className="col-span-2 bg-white rounded-2xl p-12 text-center text-slate-400 text-xs border border-slate-200">
            Nenhuma tarefa de acompanhamento encontrada com os filtros atuais.
          </div>
        )}
      </div>
    </div>
  );
};
