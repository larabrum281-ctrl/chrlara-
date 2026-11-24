import React, {useState} from 'react';
import {Check, Zap} from 'lucide-react';
import type {User} from 'firebase/auth';
import {
  claimProfileAndPrivateInfo,
  isUsernameAvailable,
  isValidUsernameFormat,
  sanitizeUsername,
} from '../lib/flashService';
import type {UserProfile} from '../types/flash';

interface Props {
  user: User;
  onCompleted: (profile: UserProfile) => void;
}

export const UsernameSetupModal: React.FC<Props> = ({user, onCompleted}) => {
  const defaultHandle = sanitizeUsername(
    (user.email?.split('@')[0] || user.displayName || 'flashuser').replace(/\./g, '_')
  );
  const [username, setUsername] = useState(defaultHandle.length >= 3 ? defaultHandle : '');
  const [displayName, setDisplayName] = useState(
    user.displayName || user.email?.split('@')[0] || ''
  );
  const [bio, setBio] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUsernameChange = (val: string) => {
    const clean = sanitizeUsername(val);
    setUsername(clean);
    setAvailable(null);
    setError(null);
  };

  const handleCheck = async () => {
    if (!isValidUsernameFormat(username)) {
      setError('Use 3 a 24 caracteres: letras minúsculas, números ou _.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const ok = await isUsernameAvailable(username);
      setAvailable(ok);
      if (!ok) setError('Este @usuário já está em uso.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar usuário.');
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidUsernameFormat(username)) {
      setError('Escolha um @usuário válido (3–24 caracteres, a-z, 0-9, _).');
      return;
    }
    if (!displayName.trim()) {
      setError('Informe seu nome de exibição.');
      return;
    }
    setSubmitting(true);
    try {
      const profile = await claimProfileAndPrivateInfo({
        username,
        displayName,
        bio,
      });
      onCompleted(profile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar perfil.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F6F5F0] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#141418] border border-[#27272E] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#FF5A1F] fill-[#FF5A1F]" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-[#F6F5F0]">Configure seu perfil</h1>
            <p className="text-xs text-[#9A98A1]">Escolha como seus amigos vão encontrar você</p>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="setup-username" className="block text-xs font-medium text-[#C7C5CE]">
              Nome de usuário único
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#6B6973]">
                  @
                </span>
                <input
                  id="setup-username"
                  type="text"
                  required
                  maxLength={24}
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="seu_nome"
                  className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] pl-8 pr-4 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCheck()}
                disabled={checking || !isValidUsernameFormat(username)}
                className="min-h-[44px] px-3.5 rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-xs font-medium text-[#F6F5F0] hover:bg-[#272730] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {checking ? '...' : 'Verificar'}
              </button>
            </div>
            {available === true && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> @{username} está disponível
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setup-display" className="block text-xs font-medium text-[#C7C5CE]">
              Nome de exibição
            </label>
            <input
              id="setup-display"
              type="text"
              required
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como você se chama"
              className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-4 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setup-bio" className="block text-xs font-medium text-[#C7C5CE]">
              Bio (opcional)
            </label>
            <input
              id="setup-bio"
              type="text"
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Uma frase curta sobre você"
              className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-4 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
            />
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-xl bg-[#FF5A1F] text-white font-semibold text-sm hover:bg-[#e54d15] transition-colors disabled:opacity-60"
          >
            {submitting ? 'Salvando perfil...' : 'Começar a usar o FLASH'}
          </button>
        </form>
      </div>
    </div>
  );
};
