import React from 'react';
import {
  LayoutDashboard,
  CalendarCheck2,
  Send,
  MessageSquareText,
  Users,
  Smartphone,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  pendingAttentionCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  pendingAttentionCount
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'events', label: 'Eventos & Presença', icon: CalendarCheck2 },
    { id: 'campaigns', label: 'Campanhas Pós-Evento', icon: Send },
    {
      id: 'conversations',
      label: 'Conversas & IA',
      icon: MessageSquareText,
      badge: pendingAttentionCount > 0 ? pendingAttentionCount : null
    },
    { id: 'persons', label: 'Pessoas & CRM', icon: Users },
    { id: 'sandbox', label: 'Simulador WhatsApp', icon: Smartphone, highlight: true }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 flex items-center justify-center text-white shadow-lg shadow-green-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight text-base flex items-center gap-1.5">
              Conecta <span className="text-emerald-400 text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 font-semibold border border-emerald-500/20">CRM</span>
            </h1>
            <p className="text-xs text-slate-400">Relacionamento & IA</p>
          </div>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Módulos Principais
        </div>
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              } ${item.highlight && !isActive ? 'border border-emerald-500/30 text-emerald-300 bg-emerald-950/20' : ''}`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/50">
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>LGPD & Meta API Compliance</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Conecta Platform v1.0 MVP</p>
      </div>
    </aside>
  );
};
