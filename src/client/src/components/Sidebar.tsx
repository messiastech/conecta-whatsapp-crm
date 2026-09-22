import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Send,
  MessageSquareText,
  Users,
  Smartphone,
  Sparkles,
  ClipboardList,
  Settings,
  LogOut
} from 'lucide-react';
import { OrgSwitcher } from './OrgSwitcher.js';
import { OrganizationItem, AuthUser } from '../types.js';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  pendingAttentionCount?: number;
  pendingTasksCount?: number;
  organizations: OrganizationItem[];
  activeOrgId: string | null;
  onSelectOrg: (orgId: string) => void;
  onCreateOrg: (name: string) => Promise<void>;
  user: AuthUser | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  pendingAttentionCount = 0,
  pendingTasksCount = 0,
  organizations,
  activeOrgId,
  onSelectOrg,
  onCreateOrg,
  user,
  onLogout
}) => {
  const activeOrg = organizations.find(o => o.id === activeOrgId);
  const isAccounting = activeOrg?.verticalProfile === 'ACCOUNTING';

  const menuItems = isAccounting
    ? [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null
        },
        {
          id: 'persons',
          label: 'Igrejas & Clientes',
          icon: Users,
          badge: null
        },
        {
          id: 'conversations',
          label: 'Atendimentos',
          icon: MessageSquareText,
          badge: pendingAttentionCount > 0 ? `${pendingAttentionCount} alertas` : null,
          badgeColor: 'bg-rose-500 text-white'
        },
        {
          id: 'tasks',
          label: 'Pendências Fiscais',
          icon: ClipboardList,
          badge: pendingTasksCount > 0 ? `${pendingTasksCount} pendentes` : null,
          badgeColor: 'bg-amber-500 text-white'
        },
        {
          id: 'settings',
          label: 'Configurações',
          icon: Settings,
          badge: null
        }
      ]
    : [
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
          id: 'settings',
          label: 'Configurações',
          icon: Settings,
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

  const userInitials = user?.name
    ? user.name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 shadow-xl border-r border-slate-800">
      <div className="flex flex-col overflow-hidden">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${isAccounting ? 'bg-gradient-to-br from-indigo-500 to-violet-700 shadow-indigo-900/40' : 'bg-gradient-to-br from-emerald-500 to-teal-700 shadow-emerald-900/30'} flex items-center justify-center text-white shadow-lg shrink-0`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-white tracking-wide text-xs leading-tight truncate">
              {isAccounting ? (activeOrg?.brandName || 'YESHUA DESK IGREJAS') : 'Conecta CRM'}
            </h1>
            <span className={`text-[10px] font-medium ${isAccounting ? 'text-indigo-400' : 'text-emerald-400'} truncate block`}>
              {isAccounting ? (activeOrg?.brandSubtitle || 'Contabilidade Especializada para Igrejas e Terceiro Setor') : 'SaaS Multi-Tenant'}
            </span>
          </div>
        </div>

        {/* Multi-Tenant Org Switcher */}
        <OrgSwitcher
          organizations={organizations}
          activeOrgId={activeOrgId}
          onSelectOrg={onSelectOrg}
          onCreateOrg={onCreateOrg}
        />

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 overflow-y-auto">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
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

      {/* User / Session Info Footer with Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
            {userInitials}
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-white truncate">{user?.name || 'Usuário'}</div>
            <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
          </div>
        </div>

        <button
          onClick={onLogout}
          title="Sair da Conta"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
