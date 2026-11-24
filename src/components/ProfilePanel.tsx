import React, {useRef, useState} from 'react';
import {signOut} from 'firebase/auth';
import {Bell, Camera, LogOut, Save} from 'lucide-react';
import {auth} from '../lib/firebase';
import {
  updateProfileInfo,
  updatePushPreference,
  uploadProfileAvatar,
} from '../lib/flashService';
import type {UserPrivateInfo, UserProfile} from '../types/flash';
import {PWAInstallButton} from './PWAInstallButton';

interface Props {
  me: UserProfile;
  privateInfo: UserPrivateInfo | null;
  onUpdated: () => Promise<void>;
}

export const ProfilePanel: React.FC<Props> = ({me, privateInfo, onUpdated}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio || '');
  const [pushEnabled, setPushEnabled] = useState(privateInfo?.pushEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      await updateProfileInfo({displayName, bio});
      if (privateInfo && pushEnabled !== privateInfo.pushEnabled) {
        await updatePushPreference(pushEnabled);
      }
      await onUpdated();
      setMsg('Perfil atualizado.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setMsg(null);
    try {
      const url = await uploadProfileAvatar(file);
      await updateProfileInfo({displayName, bio, photoURL: url});
      await onUpdated();
      setMsg('Foto de perfil atualizada.');
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar a foto para o Firebase Storage.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#141418] border border-[#27272E] rounded-2xl p-6 flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="w-16 h-16 rounded-full bg-[#232329] flex items-center justify-center text-lg font-bold overflow-hidden">
            {me.photoURL ? (
              <img
                src={me.photoURL}
                alt={me.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              me.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void handleAvatarChange(e)}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            aria-label="Alterar foto de perfil"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#FF5A1F] text-white flex items-center justify-center border-2 border-[#141418]"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-[#F6F5F0] truncate">
            {me.displayName}
          </h2>
          <p className="text-xs text-[#9A98A1] truncate">
            @{me.username}
            {privateInfo?.email ? ` · ${privateInfo.email}` : ''}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleSave(e)}
        className="bg-[#141418] border border-[#27272E] rounded-2xl p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="prof-name" className="block text-xs font-medium text-[#C7C5CE]">
            Nome de exibição
          </label>
          <input
            id="prof-name"
            type="text"
            required
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-3.5 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="prof-bio" className="block text-xs font-medium text-[#C7C5CE]">
            Bio
          </label>
          <input
            id="prof-bio"
            type="text"
            maxLength={160}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Conte algo sobre seus momentos..."
            className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-3.5 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
          />
        </div>

        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <span className="flex items-center gap-2 text-sm text-[#F6F5F0]">
            <Bell className="w-4 h-4 text-[#FF5A1F]" />
            Alertas de novos instantes
          </span>
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => setPushEnabled(e.target.checked)}
            className="w-5 h-5 accent-[#FF5A1F]"
          />
        </label>

        {msg && <p className="text-xs text-emerald-400">{msg}</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[44px] rounded-xl bg-[#FF5A1F] text-white text-sm font-semibold hover:bg-[#e54d15] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Salvando...' : 'Salvar alterações'}</span>
        </button>
      </form>

      <div className="bg-[#141418] border border-[#27272E] rounded-2xl p-5 space-y-3">
        <PWAInstallButton />
        <button
          type="button"
          onClick={() => void signOut(auth)}
          className="w-full min-h-[44px] rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-sm font-medium text-red-300 hover:bg-red-950/40 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair da conta</span>
        </button>
      </div>
    </div>
  );
};
