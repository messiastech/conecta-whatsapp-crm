import React, { useState, useEffect } from 'react';
import { api, setGlobalActiveOrgId } from '../services/api.js';
import { AuthUser } from '../types.js';
import { MessageSquare, Lock, Mail, User, ArrowRight, Sparkles, Building, Briefcase } from 'lucide-react';

interface LoginViewProps {
  onAuthSuccess: (user: AuthUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onAuthSuccess }) => {
  const [config, setConfig] = useState<{
    verticalProfile?: string;
    allowPublicSignup?: boolean;
    brandName?: string;
    brandSubtitle?: string;
    demoUserEmail?: string;
  }>({
    verticalProfile: 'DEFAULT',
    allowPublicSignup: true,
    brandName: 'Conecta CRM',
    brandSubtitle: 'SaaS Multi-Tenant & IA'
  });

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPublicConfig().then(cfg => {
      if (cfg && cfg.verticalProfile) {
        setConfig(cfg);
        if (cfg.demoUserEmail) {
          setEmail(cfg.demoUserEmail);
        }
      }
    }).catch(() => {});
  }, []);

  const isAccounting = config.verticalProfile === 'ACCOUNTING';
  const allowSignup = config.allowPublicSignup !== false && !isAccounting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp && allowSignup) {
        if (!name.trim()) throw new Error('Por favor, informe seu nome.');
        const res = await api.signUp(name, email, password);
        // Cria a organização inicial para o novo usuário
        const defaultOrgName = orgName.trim() || 'Minha Comunidade';
        const org = await api.createOrganization(defaultOrgName);
        setGlobalActiveOrgId(org.id);
        onAuthSuccess(res.user);
      } else {
        const res = await api.login(email, password);
        // Carrega organizações do usuário
        const orgs = await api.getMyOrganizations().catch(() => []);
        if (orgs.length > 0) {
          setGlobalActiveOrgId(orgs[0].id);
        }
        onAuthSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Erro durante a autenticação');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 ${isAccounting ? 'bg-blue-500/10' : 'bg-emerald-500/10'} rounded-full blur-3xl pointer-events-none`} />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex items-center justify-center gap-3">
          <div className={`w-12 h-12 rounded-2xl ${isAccounting ? 'bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-blue-500/20' : 'bg-gradient-to-tr from-emerald-500 to-teal-400 shadow-emerald-500/20'} flex items-center justify-center shadow-lg`}>
            {isAccounting ? (
              <Briefcase className="w-6 h-6 text-white" />
            ) : (
              <MessageSquare className="w-6 h-6 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isAccounting ? (config.brandName || 'YESHUA AI CLIENT DESK') : 'Conecta CRM'}
            </h1>
            <p className={`text-xs ${isAccounting ? 'text-blue-400' : 'text-emerald-400'} font-medium tracking-wide uppercase flex items-center gap-1`}>
              <Sparkles className="w-3 h-3" /> {isAccounting ? (config.brandSubtitle || 'powered by MEGA CORE') : 'SaaS Multi-Tenant & IA'}
            </p>
          </div>
        </div>

        <h2 className="mt-6 text-center text-xl font-medium text-slate-300">
          {isAccounting
            ? 'Ambiente de Demonstração Yeshua Contabilidade'
            : isSignUp
            ? 'Crie sua conta e seu Workspace'
            : 'Entre no seu Workspace'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700/60 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-medium">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isSignUp && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Seu Nome Completo
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex: Pastor Roberto Lima"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Nome do seu Workspace / Comunidade
                  </label>
                  <div className="relative">
                    <Building className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={orgName}
                      onChange={e => setOrgName(e.target.value)}
                      placeholder="Ex: Igreja Central / Comunidade da Graça"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                E-mail Profissional
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={isAccounting ? 'demo@yeshuacontabilidade.com.br' : 'pastor@suacomunidade.org'}
                  className={`w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${isAccounting ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'} text-sm`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${isAccounting ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'} text-sm`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-2 py-3 px-4 ${isAccounting ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'} text-white font-medium rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm cursor-pointer`}
            >
              {loading ? (
                'Processando...'
              ) : isAccounting ? (
                <>
                  Acessar Yeshua Client Desk <ArrowRight className="w-4 h-4" />
                </>
              ) : isSignUp ? (
                <>
                  Criar Conta & Workspace <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Entrar no Workspace <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {allowSignup ? (
            <div className="mt-6 pt-6 border-t border-slate-700/60 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {isSignUp ? 'Já possui um Workspace? Entre aqui' : 'Ainda não tem conta? Crie seu Workspace grátis'}
              </button>
            </div>
          ) : isAccounting ? (
            <div className="mt-6 pt-6 border-t border-slate-700/60 text-center">
              <p className="text-xs text-slate-400 font-medium">
                Demonstração Pública Controlada • Credenciais fornecidas pela equipe Yeshua
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
