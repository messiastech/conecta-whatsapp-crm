import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Send,
  MessageSquareText,
  Users,
  Smartphone,
  Sparkles,
  ClipboardList
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  pendingAttentionCount?: number;
  pendingTasksCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  pendingAttentionCount = 0,
  pendingTasksCount = 0
}) => {
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'events',
      label: 'Eventos & Presença',
      icon: CalendarDays,
      badge: null
    },
    {
      id: 'campaigns',
      label: 'Campanhas WhatsApp',
      icon: Send,
      badge: null
    },
    {
      id: 'conversations',
      label: 'Conversas & IA',
      icon: MessageSquareText,
      badge: pendingAttentionCount > 0 ? `${pendingAttentionCount} alertas` : null,
      badgeColor: 'bg-rose-500 text-white'
    },
    {
      id: 'tasks',
      label: 'Acompanhamentos',
      icon: ClipboardList,
      badge: pendingTasksCount > 0 ? `${pendingTasksCount} pendentes` : null,
      badgeColor: 'bg-amber-500 text-white'
    },
    {
      id: 'persons',
      label: 'Pessoas & CRM',
      icon: Users,
      badge: null
    },
    {
      id: 'sandbox',
      label: 'Simulador WhatsApp',
      icon: Smartphone,
      badge: 'Sandbox',
      badgeColor: 'bg-emerald-100 text-emerald-800'
    }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 shadow-xl border-r border-slate-800">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-lg shadow-emerald-900/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wide text-base leading-tight">Conecta CRM</h1>
            <span className="text-[11px] font-medium text-emerald-400">Relacionamento & IA</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User / Session Info Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs">
            TR
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-white truncate">Pastor Tiago Rocha</div>
            <div className="text-[10px] text-slate-400 truncate">Liderança Comunitária</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
