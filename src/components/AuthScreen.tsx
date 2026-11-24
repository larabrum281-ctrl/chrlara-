import React, {useState} from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {Camera, EyeOff, MailCheck, RefreshCw, ShieldCheck, Zap} from 'lucide-react';
import {auth, googleProvider} from '../lib/firebase';
import {PWAInstallButton} from './PWAInstallButton';

interface Props {
  unverifiedUser: User | null;
  onVerifiedRefresh: () => Promise<void>;
}

export const AuthScreen: React.FC<Props> = ({unverifiedUser, onVerifiedRefresh}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao entrar com Google.';
      if (msg.includes('popup-closed-by-user')) {
        setError('Login cancelado. Tente novamente quando estiver pronto.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    if (!email.trim() || password.length < 6) {
      setError('Informe um e-mail válido e senha com pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
        setInfoMsg('Enviamos um link de confirmação para o seu e-mail.');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: unknown) {
      const code = (err as {code?: string})?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setError(
          'Login por e-mail/senha ainda não ativado no console do Firebase. Use "Continuar com Google" ou ative Email/Password em Authentication > Sign-in method.'
        );
      } else if (code === 'auth/email-already-in-use') {
        setError('Este e-mail já está cadastrado. Tente fazer login.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos.');
      } else {
        setError(err instanceof Error ? err.message : 'Erro na autenticação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    setLoading(true);
    setError(null);
    try {
      await sendEmailVerification(unverifiedUser);
      setInfoMsg('Novo link de verificação enviado.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar.');
    } finally {
      setLoading(false);
    }
  };

  if (unverifiedUser) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-[#F6F5F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#141418] border border-[#27272E] rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="w-12 h-12 rounded-xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/30 flex items-center justify-center">
            <MailCheck className="w-6 h-6 text-[#FF5A1F]" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-[#F6F5F0]">
              Confirme seu e-mail
            </h1>
            <p className="text-sm text-[#9A98A1] leading-relaxed">
              Para proteger sua conta e liberar o envio de instantes, confirme o endereço{' '}
              <span className="text-[#F6F5F0] font-medium">{unverifiedUser.email}</span> pelo link
              enviado na sua caixa de entrada.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl p-3">
              {error}
            </p>
          )}
          {infoMsg && (
            <p className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-3">
              {infoMsg}
            </p>
          )}

          <div className="space-y-3">
            <button
              onClick={() => void onVerifiedRefresh()}
              disabled={loading}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#FF5A1F] text-white font-medium text-sm hover:bg-[#e54d15] transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Já confirmei meu e-mail</span>
            </button>
            <button
              onClick={() => void handleResendVerification()}
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-sm font-medium text-[#F6F5F0] hover:bg-[#26262E] transition-colors"
            >
              Reenviar link de confirmação
            </button>
            <button
              onClick={() => void signOut(auth)}
              className="w-full min-h-[44px] text-xs text-[#9A98A1] hover:text-white transition-colors"
            >
              Sair e usar outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F6F5F0] flex flex-col">
      <header className="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <Zap className="w-5 h-5 text-[#FF5A1F] fill-[#FF5A1F]" />
          <span className="font-display text-lg font-extrabold tracking-tight">FLASH</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton compact />
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between bg-[#141418] border border-[#27272E] rounded-2xl p-6 sm:p-8 lg:p-10">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-[#9A98A1]">
                <span>Fotografia efêmera</span>
                <span aria-hidden="true">·</span>
                <span>Visualização única</span>
                <span aria-hidden="true">·</span>
                <span>PWA</span>
              </div>
              <h1
                className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#F6F5F0] leading-[1.15]"
                style={{textWrap: 'balance'}}
              >
                Momentos reais que existem apenas uma vez.
              </h1>
              <p className="text-sm sm:text-base text-[#9A98A1] leading-relaxed max-w-lg">
                Envie fotos instantâneas para amigos próximos. Cada instante abre uma única vez,
                com validação no servidor e exclusão automática após expirar.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={loading}
                className="w-full min-h-[48px] flex items-center justify-center gap-3 rounded-xl bg-[#F6F5F0] text-[#0B0B0D] font-semibold text-sm hover:bg-white transition-colors disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continuar com Google</span>
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-[#27272E]" />
                <span className="text-xs text-[#9A98A1]">ou por e-mail</span>
                <div className="h-px flex-1 bg-[#27272E]" />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#0B0B0D] rounded-xl border border-[#27272E]">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`flex-1 min-h-[40px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'login'
                      ? 'bg-[#1E1E24] text-[#F6F5F0]'
                      : 'text-[#9A98A1] hover:text-white'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`flex-1 min-h-[40px] text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'register'
                      ? 'bg-[#1E1E24] text-[#F6F5F0]'
                      : 'text-[#9A98A1] hover:text-white'
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <form onSubmit={(e) => void handleEmailAuth(e)} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-4 text-sm text-[#F6F5F0] placeholder:text-[#6B6973] focus:outline-none focus:border-[#FF5A1F]"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha (mínimo 6 caracteres)"
                  className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-4 text-sm text-[#F6F5F0] placeholder:text-[#6B6973] focus:outline-none focus:border-[#FF5A1F]"
                />
                {error && (
                  <p className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl p-3 leading-relaxed">
                    {error}
                  </p>
                )}
                {infoMsg && (
                  <p className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-3">
                    {infoMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-[#FF5A1F] text-white font-semibold text-sm hover:bg-[#e54d15] transition-colors disabled:opacity-60"
                >
                  {loading
                    ? 'Autenticando...'
                    : mode === 'register'
                    ? 'Criar conta no FLASH'
                    : 'Entrar no FLASH'}
                </button>
              </form>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[#232329] grid grid-cols-3 gap-4 text-xs text-[#9A98A1]">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-[#FF5A1F] shrink-0" />
              <span>Abre 1 vez</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#FF5A1F] shrink-0" />
              <span>Trava no servidor</span>
            </div>
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#FF5A1F] shrink-0" />
              <span>App instalável</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-[#27272E] bg-[#141418] min-h-[340px] lg:min-h-[540px]">
          {!imgFailed ? (
            <img
              src="/src/assets/images/flash_auth_showcase_1795529115303.jpg"
              alt="Amigos registrando um momento espontâneo à noite com o FLASH"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover lg:h-full"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[#141418] text-center gap-3">
              <Camera className="w-10 h-10 text-[#FF5A1F]" />
              <p className="font-display font-bold text-lg">Captura instantânea</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-6 sm:p-8">
            <p className="font-display text-lg font-bold text-white">
              Sem feed infinito. Sem replay.
            </p>
            <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-md">
              Cada foto enviada possui identificador único, registro de abertura e expiração
              automática garantida pelo backend.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
