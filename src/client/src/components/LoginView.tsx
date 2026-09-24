import React, { useState, useEffect } from 'react';
import { api, setGlobalActiveOrgId } from '../services/api.js';
import { AuthUser } from '../types.js';
import {
  MessageSquare,
  Lock,
  Mail,
  User,
  ArrowRight,
  Sparkles,
  Building,
  Briefcase,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  AlertCircle
} from 'lucide-react';

interface LoginViewProps {
  onAuthSuccess: (user: AuthUser) => void;
}

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

export const LoginView: React.FC<LoginViewProps> = ({ onAuthSuccess }) => {
  const [config, setConfig] = useState<{
    verticalProfile?: string;
    allowPublicSignup?: boolean;
    recoveryEnabled?: boolean;
    passwordResetEnabled?: boolean;
    brandName?: string;
    brandSubtitle?: string;
    demoUserEmail?: string;
  }>({
    verticalProfile: 'DEFAULT',
    allowPublicSignup: true,
    recoveryEnabled: false,
    passwordResetEnabled: false,
    brandName: 'Conecta CRM',
    brandSubtitle: 'SaaS Multi-Tenant & IA'
  });

  const getInitialRoute = (): { mode: AuthMode; token: string } => {
    const path = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const queryToken = searchParams.get('token') || '';

    if (path === '/forgot-password') {
      return { mode: 'forgot-password', token: '' };
    }
    if (path.startsWith('/reset-password')) {
      const pathToken = path.replace(/^\/reset-password\/?/, '').trim();
      return { mode: 'reset-password', token: queryToken || pathToken };
    }
    return { mode: 'login', token: '' };
  };

  const initialRoute = getInitialRoute();
  const [mode, setMode] = useState<AuthMode>(initialRoute.mode);
  const [resetToken, setResetToken] = useState<string>(initialRoute.token);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  useEffect(() => {
    const handlePopState = () => {
      const route = getInitialRoute();
      setMode(route.mode);
      if (route.token) setResetToken(route.token);
      setError(null);
      setSuccessMessage(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newMode: AuthMode, path: string) => {
    setError(null);
    setSuccessMessage(null);
    setMode(newMode);
    window.history.pushState(null, '', path);
  };

  const isAccounting = config.verticalProfile === 'ACCOUNTING';
  const allowSignup = config.allowPublicSignup !== false && !isAccounting;
  const isPasswordResetEnabled = Boolean(config.recoveryEnabled ?? config.passwordResetEnabled);

  const handleLoginOrSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup' && allowSignup) {
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

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (!email.trim()) {
        throw new Error('Por favor, informe seu e-mail.');
      }
      await api.requestPasswordReset(email.trim(), '/reset-password');
      // Feedback genérico anti-enumeração
      setSuccessMessage('Se o e-mail informado estiver cadastrado, as instruções para redefinição foram enviadas para sua caixa de entrada.');
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao processar a solicitação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!resetToken) {
      setError('Token de recuperação não identificado. Por favor, utilize o link recebido por e-mail.');
      return;
    }
    if (newPassword.length < 8) {
      setError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword.length > 128) {
      setError('A nova senha não pode exceder 128 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação de senha não coincide com a nova senha.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      setSuccessMessage('Senha redefinida com sucesso! Você já pode entrar com sua nova senha.');
      setTimeout(() => {
        navigateTo('login', '/');
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Token de recuperação inválido ou expirado. Solicite um novo link.');
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
              {isAccounting ? (config.brandName || 'YESHUA DESK IGREJAS') : 'Conecta CRM'}
            </h1>
            <p className={`text-xs ${isAccounting ? 'text-blue-400' : 'text-emerald-400'} font-medium tracking-wide uppercase flex items-center gap-1`}>
              <Sparkles className="w-3 h-3" /> {isAccounting ? (config.brandSubtitle || 'Contabilidade Especializada para Igrejas e Terceiro Setor') : 'SaaS Multi-Tenant & IA'}
            </p>
          </div>
        </div>

        <h2 className="mt-6 text-center text-xl font-medium text-slate-300">
          {mode === 'forgot-password'
            ? 'Recuperar Acesso'
            : mode === 'reset-password'
            ? 'Redefinir Senha'
            : isAccounting
            ? 'Plataforma Operacional Yeshua Desk Igrejas'
            : mode === 'signup'
            ? 'Crie sua conta e seu Workspace'
            : 'Entre no seu Workspace'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700/60 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-medium flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* VIEW: FORGOT PASSWORD */}
          {mode === 'forgot-password' ? (
            !isPasswordResetEnabled ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-300 mb-6">
                  A recuperação de senha não está habilitada neste ambiente. Entre em contato com o suporte ou administrador.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo('login', '/')}
                  className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl text-sm transition-colors"
                >
                  Voltar ao Login
                </button>
              </div>
            ) : successMessage ? (
              <div className="text-center py-4">
                <button
                  type="button"
                  onClick={() => navigateTo('login', '/')}
                  className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar ao Login
                </button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleRequestPasswordReset}>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Informe o seu e-mail cadastrado. Se o e-mail existir no sistema, você receberá um link seguro para cadastrar uma nova senha.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    E-mail Cadastrado
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu.email@dominio.com"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${isAccounting ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'} text-sm`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full mt-2 py-3 px-4 ${isAccounting ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'} text-white font-medium rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm cursor-pointer`}
                >
                  {loading ? 'Enviando...' : (
                    <>
                      Enviar Link de Recuperação <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="mt-4 pt-4 border-t border-slate-700/60 text-center">
                  <button
                    type="button"
                    onClick={() => navigateTo('login', '/')}
                    className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar ao Login
                  </button>
                </div>
              </form>
            )
          ) : mode === 'reset-password' ? (
            /* VIEW: RESET PASSWORD */
            !isPasswordResetEnabled ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-300 mb-6">
                  A redefinição de senha não está habilitada neste ambiente.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo('login', '/')}
                  className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl text-sm transition-colors"
                >
                  Voltar ao Login
                </button>
              </div>
            ) : !resetToken ? (
              <div className="text-center py-4">
                <p className="text-sm text-rose-300 mb-6">
                  Token de redefinição não encontrado ou link incompleto. Solicite um novo link de recuperação.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo('forgot-password', '/forgot-password')}
                  className={`w-full py-2.5 px-4 ${isAccounting ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-medium rounded-xl text-sm transition-colors`}
                >
                  Solicitar Novo Link
                </button>
              </div>
            ) : successMessage ? (
              <div className="text-center py-4">
                <button
                  type="button"
                  onClick={() => navigateTo('login', '/')}
                  className={`w-full py-2.5 px-4 ${isAccounting ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white font-medium rounded-xl text-sm transition-colors flex items-center justify-center gap-2`}
                >
                  Entrar no Workspace <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleResetPassword}>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Crie uma nova senha segura para o seu acesso (mínimo de 8 caracteres).
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${isAccounting ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'} text-sm`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${isAccounting ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'} text-sm`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full mt-2 py-3 px-4 ${isAccounting ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'} text-white font-medium rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm cursor-pointer`}
                >
                  {loading ? 'Salvando...' : (
                    <>
                      Salvar Nova Senha <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="mt-4 pt-4 border-t border-slate-700/60 text-center">
                  <button
                    type="button"
                    onClick={() => navigateTo('login', '/')}
                    className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar ao Login
                  </button>
                </div>
              </form>
            )
          ) : (
            /* VIEW: LOGIN OU SIGNUP */
            <form className="space-y-4" onSubmit={handleLoginOrSignUp}>
              {mode === 'signup' && (
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
                    placeholder={isAccounting ? 'admin@yeshuacontabilidade.com.br' : 'pastor@suacomunidade.org'}
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 ${isAccounting ? 'focus:ring-blue-500' : 'focus:ring-emerald-500'} text-sm`}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Senha
                  </label>
                  {isPasswordResetEnabled && mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => navigateTo('forgot-password', '/forgot-password')}
                      className={`text-xs ${isAccounting ? 'text-blue-400 hover:text-blue-300' : 'text-emerald-400 hover:text-emerald-300'} transition-colors cursor-pointer`}
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
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
                    Acessar Yeshua Desk Igrejas <ArrowRight className="w-4 h-4" />
                  </>
                ) : mode === 'signup' ? (
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
          )}

          {mode === 'login' || mode === 'signup' ? (
            allowSignup ? (
              <div className="mt-6 pt-6 border-t border-slate-700/60 text-center">
                <button
                  type="button"
                  onClick={() => {
                    const newMode = mode === 'signup' ? 'login' : 'signup';
                    navigateTo(newMode, newMode === 'signup' ? '/signup' : '/');
                  }}
                  className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  {mode === 'signup' ? 'Já possui um Workspace? Entre aqui' : 'Ainda não tem conta? Crie seu Workspace grátis'}
                </button>
              </div>
            ) : isAccounting ? (
              <div className="mt-6 pt-6 border-t border-slate-700/60 text-center">
                <p className="text-xs text-slate-400 font-medium">
                  Yeshua Contabilidade • Soluções Fiscais e Gestão para Igrejas
                </p>
              </div>
            ) : null
          ) : null}
        </div>
      </div>
    </div>
  );
};
