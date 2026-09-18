import React, { useState } from 'react';
import {
  Calendar,
  Upload,
  Plus,
  CheckCircle2,
  UserX,
  FileSpreadsheet,
  AlertCircle,
  MapPin,
  Send,
  Users
} from 'lucide-react';
import { EventItem, PersonItem } from '../types.js';
import { api } from '../services/api.js';

interface EventsViewProps {
  events: EventItem[];
  persons?: PersonItem[];
  onRefresh: () => void;
  onSelectCampaignEvent: (eventId: string) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({
  events,
  persons = [],
  onRefresh,
  onSelectCampaignEvent
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEventForImport, setSelectedEventForImport] = useState<string | null>(null);
  const [selectedEventDetails, setSelectedEventDetails] = useState<EventItem | null>(null);
  const [selectedPersonForAtt, setSelectedPersonForAtt] = useState<string>('');
  const [attStatus, setAttStatus] = useState<boolean>(true);
  const [attLoading, setAttLoading] = useState<boolean>(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState('Templo Principal');
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !eventDate) return;

    try {
      setLoading(true);
      await api.createEvent({
        name,
        description,
        eventDate: new Date(eventDate).toISOString(),
        location
      });
      setShowCreateModal(false);
      setName('');
      setDescription('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar evento');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (eventId: string, file: File) => {
    try {
      setLoading(true);
      const res = await api.importSpreadsheet(eventId, file);
      setImportResult(res);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao importar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = async (eventId: string) => {
    try {
      setLoading(true);
      const details = await api.getEventById(eventId);
      setSelectedEventDetails(details);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventDetails || !selectedPersonForAtt) return;

    try {
      setAttLoading(true);
      await api.registerAttendance(selectedEventDetails.id, {
        personId: selectedPersonForAtt,
        attended: attStatus
      });
      const updated = await api.getEventById(selectedEventDetails.id);
      setSelectedEventDetails(updated);
      setSelectedPersonForAtt('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar presença');
    } finally {
      setAttLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Eventos & Controle de Presença</h2>
          <p className="text-xs text-slate-500">Crie encontros, importe listas de participantes e acompanhe o engajamento</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Evento
        </button>
      </div>

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {events.map(ev => {
          const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'medium',
            timeStyle: 'short'
          }).format(new Date(ev.eventDate));

          return (
            <div key={ev.id} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-500/50 transition-all">
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-slate-900 text-base">{ev.name}</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                    {ev.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-500 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{dateFormatted}</span>
                  </div>
                  {ev.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{ev.location}</span>
                    </div>
                  )}
                </div>

                {/* Presence Badges */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{ev.totalAttendees}</div>
                      <div className="text-[10px] text-slate-500">Presentes</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-rose-600" />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{ev.totalAbsentees}</div>
                      <div className="text-[10px] text-slate-500">Ausentes</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedEventForImport(ev.id)}
                    className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Importar Planilha
                  </button>
                  <button
                    onClick={() => handleOpenDetails(ev.id)}
                    className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => onSelectCampaignEvent(ev.id)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Send className="w-3.5 h-3.5" /> Criar Campanha Pós-Evento
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Criar Evento */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Criar Novo Evento</h3>
            <p className="text-xs text-slate-500 mb-4">Cadastre as informações básicas do encontro</p>

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Evento</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Culto de Jovens, Encontro de Casais"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Data e Horário</label>
                <input
                  type="datetime-local"
                  required
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Local / Endereço</label>
                <input
                  type="text"
                  placeholder="Ex: Templo Principal, Sala 04"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Breve resumo do evento..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
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
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Importar Planilha */}
      {selectedEventForImport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Importar Lista de Presença</h3>
            <p className="text-xs text-slate-500 mb-4">
              Selecione um arquivo <strong>.CSV</strong> ou <strong>.XLSX</strong> contendo no mínimo as colunas <em>Nome, Telefone</em> e <em>Participou (Sim/Não)</em>.
            </p>

            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-8 text-center transition-colors bg-slate-50">
              <FileSpreadsheet className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700 mb-1">Clique para selecionar ou arraste sua planilha</p>
              <p className="text-[11px] text-slate-400 mb-4">Formatos aceitos: CSV, XLSX, XLS</p>

              <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer shadow-sm inline-block">
                Selecionar Arquivo
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(selectedEventForImport, file);
                  }}
                />
              </label>
            </div>

            {/* Resultado da Importação se houver */}
            {importResult && (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Importação concluída com sucesso!
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>• Registros processados: <strong>{importResult.totalRows}</strong></div>
                  <div>• Pessoas importadas: <strong>{importResult.totalImported}</strong></div>
                  <div className="text-emerald-700">• Presentes: <strong>{importResult.totalPresent}</strong></div>
                  <div className="text-rose-700">• Ausentes: <strong>{importResult.totalAbsent}</strong></div>
                </div>
                {importResult.duplicatesIgnored > 0 && (
                  <div className="text-slate-500 text-[11px]">
                    * {importResult.duplicatesIgnored} duplicidade(s) tratada(s) automaticamente.
                  </div>
                )}
                {importResult.invalidRows?.length > 0 && (
                  <div className="text-amber-800 text-[11px] bg-amber-100/50 p-2 rounded">
                    <AlertCircle className="w-3.5 h-3.5 inline mr-1 text-amber-600" />
                    {importResult.invalidRows.length} linha(s) ignorada(s) por telefone/nome inválido.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setSelectedEventForImport(null);
                  setImportResult(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Evento & Participantes */}
      {selectedEventDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedEventDetails.name}</h3>
                <p className="text-xs text-slate-500">Lista completa de participantes e status de presença</p>
              </div>
              <button
                onClick={() => setSelectedEventDetails(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div>
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Presentes ({selectedEventDetails.presentCount || 0})
                </h4>
                <div className="space-y-1.5">
                  {selectedEventDetails.attendees?.map(p => (
                    <div key={p.id} className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-100 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{p.name}</span>
                      <span className="text-slate-500 font-mono">{p.normalizedPhone}</span>
                    </div>
                  ))}
                  {(!selectedEventDetails.attendees || selectedEventDetails.attendees.length === 0) && (
                    <p className="text-xs text-slate-400 italic">Nenhum presente registrado.</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <UserX className="w-3.5 h-3.5 text-rose-600" />
                  Ausentes ({selectedEventDetails.absentCount || 0})
                </h4>
                <div className="space-y-1.5">
                  {selectedEventDetails.absentees?.map(p => (
                    <div key={p.id} className="p-2.5 bg-rose-50/50 rounded-lg border border-rose-100 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{p.name}</span>
                      <span className="text-slate-500 font-mono">{p.normalizedPhone}</span>
                    </div>
                  ))}
                  {(!selectedEventDetails.absentees || selectedEventDetails.absentees.length === 0) && (
                    <p className="text-xs text-slate-400 italic">Nenhum ausente registrado.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Formulário Rápido de Registro de Presença Manual */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-600" /> Registrar Presença de Contato
              </h4>
              <form onSubmit={handleRegisterAttendance} className="flex flex-col sm:flex-row gap-2 items-center">
                <select
                  value={selectedPersonForAtt}
                  onChange={e => setSelectedPersonForAtt(e.target.value)}
                  className="flex-1 w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none"
                  required
                >
                  <option value="">Selecione um contato do CRM...</option>
                  {persons.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.normalizedPhone})
                    </option>
                  ))}
                </select>

                <select
                  value={attStatus ? 'true' : 'false'}
                  onChange={e => setAttStatus(e.target.value === 'true')}
                  className="w-full sm:w-auto px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white outline-none font-semibold"
                >
                  <option value="true">Presente</option>
                  <option value="false">Ausente</option>
                </select>

                <button
                  type="submit"
                  disabled={attLoading || !selectedPersonForAtt}
                  className="w-full sm:w-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {attLoading ? 'Salvando...' : 'Salvar Presença'}
                </button>
              </form>
            </div>

            <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  const evId = selectedEventDetails.id;
                  setSelectedEventDetails(null);
                  onSelectCampaignEvent(evId);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Disparar Campanha Pós-Evento
              </button>
              <button
                onClick={() => setSelectedEventDetails(null)}
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
