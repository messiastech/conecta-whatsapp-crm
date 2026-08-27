import React, { useState } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  UserX,
  Phone,
  Ban,
  Calendar
} from 'lucide-react';
import { PersonItem } from '../types.js';

interface PersonsViewProps {
  persons: PersonItem[];
  onRefresh: () => void;
}

export const PersonsView: React.FC<PersonsViewProps> = ({ persons }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptOut, setFilterOptOut] = useState<string>('all');
  const [selectedPerson, setSelectedPerson] = useState<PersonItem | null>(null);

  const filteredPersons = persons.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      p.normalizedPhone.includes(searchTerm);

    if (filterOptOut === 'optout') return matchesSearch && p.optOut;
    if (filterOptOut === 'active') return matchesSearch && !p.optOut;
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pessoas & Base de Relacionamento (CRM)</h2>
          <p className="text-xs text-slate-500">Histórico de presença por participante, consentimento LGPD e anotações pastorais</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou celular..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <select
          value={filterOptOut}
          onChange={e => setFilterOptOut(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-medium text-slate-700"
        >
          <option value="all">Todos os Contatos</option>
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
                <th className="py-3 px-4">Nome</th>
                <th className="py-3 px-4">Telefone (E.164)</th>
                <th className="py-3 px-4">Histórico Presença</th>
                <th className="py-3 px-4">Consentimento LGPD</th>
                <th className="py-3 px-4">Última Interação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredPersons.map(p => {
                const totalAtt = p.attendances?.length || 0;
                const totalPresent = p.attendances?.filter(a => a.attended).length || 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">
                        {p.name.charAt(0)}
                      </div>
                      <div>
                        <div>{p.name}</div>
                        {p.email && <div className="text-[11px] text-slate-400 font-normal">{p.email}</div>}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{p.normalizedPhone}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-semibold text-emerald-700">{totalPresent}</span>
                      <span className="text-slate-400"> / {totalAtt} presenças</span>
                    </td>

                    <td className="py-3 px-4">
                      {p.optOut ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1 w-fit">
                          <Ban className="w-3 h-3" /> Descadastrado (SAIR)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Ativo
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-500">
                      {p.conversations?.[0]?.lastMessageAt ? (
                        new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                          new Date(p.conversations[0].lastMessageAt)
                        )
                      ) : (
                        <span className="text-slate-400 italic">Sem conversas</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedPerson(p)}
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredPersons.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                    Nenhum contato encontrado com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalhes do Contato */}
      {selectedPerson && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedPerson.name}</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedPerson.normalizedPhone}</p>
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Status de Envio</div>
                  <div className={`font-bold mt-1 ${selectedPerson.optOut ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {selectedPerson.optOut ? 'Bloqueado (Opt-Out)' : 'Ativo para Campanhas'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Cadastrado em</div>
                  <div className="font-semibold text-slate-800 mt-1">
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(selectedPerson.createdAt))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  Histórico de Participação em Eventos
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedPerson.attendances?.map(a => (
                    <div key={a.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{a.event?.name || 'Evento'}</span>
                      {a.attended ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Presente
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 flex items-center gap-1">
                          <UserX className="w-3 h-3" /> Ausente
                        </span>
                      )}
                    </div>
                  ))}
                  {(!selectedPerson.attendances || selectedPerson.attendances.length === 0) && (
                    <p className="text-xs text-slate-400 italic">Nenhum evento registrado.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedPerson(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
