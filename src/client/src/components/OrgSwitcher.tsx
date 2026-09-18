import React, { useState } from 'react';
import { OrganizationItem } from '../types.js';
import { Building, ChevronDown, Check, Plus, ShieldCheck } from 'lucide-react';

interface OrgSwitcherProps {
  organizations: OrganizationItem[];
  activeOrgId: string | null;
  onSelectOrg: (orgId: string) => void;
  onCreateOrg: (name: string) => Promise<void>;
}

export const OrgSwitcher: React.FC<OrgSwitcherProps> = ({
  organizations,
  activeOrgId,
  onSelectOrg,
  onCreateOrg
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  const activeOrg = organizations.find(o => o.id === activeOrgId) || organizations[0];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      await onCreateOrg(newOrgName.trim());
      setNewOrgName('');
      setShowModal(false);
      setIsOpen(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao criar workspace');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative px-3 py-3 border-b border-slate-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all text-left group"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Building className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-white truncate group-hover:text-emerald-300 transition-colors">
              {activeOrg ? activeOrg.name : 'Selecione o Workspace'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                {activeOrg?.role || 'MEMBRO'}
              </span>
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-3 right-3 top-full mt-1.5 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Seus Workspaces
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 px-1.5">
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => {
                  onSelectOrg(org.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-medium transition-colors ${
                  org.id === activeOrg?.id
                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                    : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{org.name}</span>
                </div>
                {org.id === activeOrg?.id && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="mt-1 pt-1 border-t border-slate-700/60 px-1.5">
            <button
              onClick={() => {
                setShowModal(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Workspace...</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Criação de Workspace */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Criar Novo Workspace</h3>
            <p className="text-xs text-slate-400 mb-5">
              Workspaces permitem isolar participantes, eventos, campanhas e números de WhatsApp de diferentes comunidades ou departamentos.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nome do Workspace
                </label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="Ex: Igreja Zona Sul / Campus Universitário"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
