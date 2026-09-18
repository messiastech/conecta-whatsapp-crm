import React, { useState } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  UserX,
  Phone,
  Ban,
  Calendar,
  History,
  Clock,
  MessageSquare,
  Sparkles,
  ClipboardList,
  ShieldCheck,
  Plus
} from 'lucide-react';
import { PersonItem, RelationshipTimelineItem } from '../types.js';
import { api } from '../services/api.js';

interface PersonsViewProps {
  persons: PersonItem[];
  onRefresh: () => void;
}

export const PersonsView: React.FC<PersonsViewProps> = ({ persons, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptOut, setFilterOptOut] = useState<string>('all');
  const [selectedPerson, setSelectedPerson] = useState<PersonItem | null>(null);
  const [timeline, setTimeline] = useState<RelationshipTimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);

  const filteredPersons = persons.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      p.normalizedPhone.includes(searchTerm);

    if (filterOptOut === 'optout') return matchesSearch && p.optOut;
    if (filterOptOut === 'active') return matchesSearch && !p.optOut;
    return matchesSearch;
  });

  const handleOpenPerson = async (person: PersonItem) => {
    setSelectedPerson(person);
    setLoadingTimeline(true);
    try {
      const data = await api.getPersonTimeline(person.id);
      setTimeline(data.timeline || []);
    } catch (err) {
      console.error('Erro ao buscar linha do tempo:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleToggleOptOut = async () => {
    if (!selectedPerson) return;
    try {
      const newStatus = !selectedPerson.optOut;
      const updated = await api.updatePerson(selectedPerson.id, { optOut: newStatus });
      setSelectedPerson(updated);
      onRefresh();
      // Recarrega timeline
      const data = await api.getPersonTimeline(selectedPerson.id);
      setTimeline(data.timeline || []);
    } catch (err) {
      alert('Erro ao alterar consentimento do contato');
    }
  };

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    try {
      setCreateLoading(true);
      await api.createPerson({
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
        notes: newNotes.trim() || undefined
      });
      setShowCreateModal(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewNotes('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar contato');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pessoas & Histórico de Relacionamento (CRM)</h2>
          <p className="text-xs text-slate-500">
            Linha do tempo completa: eventos, campanhas, respostas, triagem de IA e consentimento LGPD
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Contato
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou celular..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <select
          value={filterOptOut}
          onChange={e => setFilterOptOut(e.target.value)}
          className="px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-slate-700"
        >
          <option value="all">Todos os Contatos ({persons.length})</option>
          <option value="active">Consentimento Ativo (Opt-In)</option>
          <option value="optout">Descadastrados (Opt-Out)</option>
        </select>
      </div>

      {/* Persons Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3.5 px-4">Nome & Contato</th>
                <th className="py-3.5 px-4">Telefone (E.164)</th>
                <th className="py-3.5 px-4">Presença em Eventos</th>
                <th className="py-3.5 px-4">Consentimento LGPD</th>
                <th className="py-3.5 px-4">Última Triagem IA</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredPersons.map(p => {
                const totalAtt = p.attendances?.length || 0;
                const totalPresent = p.attendances?.filter(a => a.attended).length || 0;
                const lastAi = p.conversations?.[0]?.aiAnalyses?.[0];

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div>
                        <div>{p.name}</div>
                        {p.email && <div className="text-[11px] text-slate-400 font-normal">{p.email}</div>}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.normalizedPhone}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-emerald-700">{totalPresent}</span>
                      <span className="text-slate-400"> / {totalAtt} no universo convidado</span>
                    </td>

                    <td className="py-3.5 px-4">
                      {p.optOut ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit">
                          <Ban className="w-3 h-3" /> Bloqueado (Opt-Out)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Ativo para Envios
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {lastAi ? (
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{lastAi.category}</span>
                          <span className="text-[10px] text-slate-400">{lastAi.sentiment}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Sem respostas</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenPerson(p)}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-1 ml-auto"
                      >
                        <History className="w-3.5 h-3.5" /> Linha do Tempo
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredPersons.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 italic">
                    Nenhum contato encontrado com os critérios selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Linha do Tempo de Relacionamento (Timeline CRM) */}
      {selectedPerson && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col">
            {/* Header do Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                  {selectedPerson.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedPerson.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedPerson.normalizedPhone}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleOptOut}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors ${
                    selectedPerson.optOut
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  {selectedPerson.optOut ? 'Reativar Consentimento' : 'Registrar Opt-Out'}
                </button>
                <button
                  onClick={() => setSelectedPerson(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Corpo com Linha do Tempo */}
            <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                Linha do Tempo Cronológica de Relacionamento
              </h4>

              {loadingTimeline ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Carregando histórico do participante...
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 py-2">
                  {timeline.map((item) => {
                    let icon = <Calendar className="w-3.5 h-3.5" />;
                    let colorBg = 'bg-slate-100 text-slate-600 border-slate-200';

                    if (item.type === 'ATTENDANCE') {
                      icon = item.badge === 'PRESENTE' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />;
                      colorBg = item.badge === 'PRESENTE' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300';
                    } else if (item.type === 'OUTBOUND_MESSAGE') {
                      icon = <MessageSquare className="w-3.5 h-3.5" />;
                      colorBg = 'bg-blue-100 text-blue-800 border-blue-300';
                    } else if (item.type === 'INBOUND_MESSAGE') {
                      icon = <MessageSquare className="w-3.5 h-3.5" />;
                      colorBg = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                    } else if (item.type === 'AI_ANALYSIS') {
                      icon = <Sparkles className="w-3.5 h-3.5" />;
                      colorBg = 'bg-indigo-100 text-indigo-800 border-indigo-300';
                    } else if (item.type === 'FOLLOW_UP_TASK') {
                      icon = <ClipboardList className="w-3.5 h-3.5" />;
                      colorBg = 'bg-amber-100 text-amber-800 border-amber-300';
                    } else if (item.type === 'CONSENT_CHANGE') {
                      icon = <ShieldCheck className="w-3.5 h-3.5" />;
                      colorBg = 'bg-slate-200 text-slate-800 border-slate-300';
                    }

                    return (
                      <div key={item.id} className="relative pl-6">
                        {/* Bullet Icon */}
                        <div className={`absolute -left-[13px] top-0.5 w-6 h-6 rounded-full border flex items-center justify-center bg-white shadow-xs ${colorBg}`}>
                          {icon}
                        </div>

                        {/* Content Card */}
                        <div className="bg-slate-50/90 rounded-2xl p-3.5 border border-slate-200 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">{item.title}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.date))}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                            {item.description}
                          </p>

                          {item.badge && (
                            <div className="pt-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorBg}`}>
                                {item.badge}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {timeline.length === 0 && (
                    <p className="text-xs text-slate-400 italic pl-6">Nenhum evento registrado nesta linha do tempo.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedPerson(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Contato */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Cadastrar Novo Contato</h3>
            <p className="text-xs text-slate-500 mb-4">Adicione um novo membro ou visitante ao CRM</p>

            <form onSubmit={handleCreatePerson} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria Silva"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Telefone (WhatsApp)</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: (11) 98765-4321 ou +5511987654321"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail (Opcional)</label>
                <input
                  type="email"
                  placeholder="Ex: maria@exemplo.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Notas pastorais, ministério, etc..."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {createLoading ? 'Salvando...' : 'Salvar Contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
