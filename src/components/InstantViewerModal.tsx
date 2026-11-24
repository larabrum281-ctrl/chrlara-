import React, {useEffect, useRef, useState} from 'react';
import {AlertTriangle, Loader2, ShieldAlert, X} from 'lucide-react';
import {completeInstantView, openInstantOnce} from '../lib/flashService';
import type {Instant, UserProfile} from '../types/flash';

interface Props {
  instant: Instant;
  me: UserProfile;
  onClose: () => void;
}

export const InstantViewerModal: React.FC<Props> = ({instant, me, onClose}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(instant.durationSeconds * 1000);
  const [totalMs, setTotalMs] = useState(instant.durationSeconds * 1000);

  const blobUrlRef = useRef<string | null>(null);
  const completedRef = useRef(false);

  const finishAndClose = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      void completeInstantView(instant.id);
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    onClose();
  };

  useEffect(() => {
    let cancelled = false;
    async function loadOnce() {
      try {
        const {blobUrl, durationSeconds} = await openInstantOnce(instant, me);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        blobUrlRef.current = blobUrl;
        const ms = durationSeconds * 1000;
        setTotalMs(ms);
        setRemainingMs(ms);
        setImageUrl(blobUrl);
        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao abrir instante.');
          setLoading(false);
        }
      }
    }

    void loadOnce();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [instant.id]);

  useEffect(() => {
    if (loading || error || !imageUrl) return;

    const started = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - started;
      const left = Math.max(0, totalMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(interval);
        finishAndClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [loading, error, imageUrl, totalMs]);

  const progressPct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const secondsDisplay = (remainingMs / 1000).toFixed(1);

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Progress + Header */}
      <div className="relative z-10 p-4 pt-safe space-y-3 bg-gradient-to-b from-black/80 to-transparent">
        <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FF5A1F] transition-[width] duration-75 ease-linear"
            style={{width: `${progressPct}%`}}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#1E1E24] flex items-center justify-center text-xs font-bold text-white overflow-hidden shrink-0">
              {instant.senderPhoto ? (
                <img
                  src={instant.senderPhoto}
                  alt={instant.senderName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                instant.senderName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{instant.senderName}</p>
              <p className="text-xs text-white/70 truncate">@{instant.senderUsername} · Visualização única</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!loading && !error && (
              <span className="font-mono-num text-sm font-bold text-[#FF5A1F]">
                {secondsDisplay}s
              </span>
            )}
            <button
              type="button"
              onClick={finishAndClose}
              aria-label="Fechar instante"
              className="min-h-[44px] min-w-[44px] rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Ephemeral Photo Area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#FF5A1F] animate-spin" />
            <p className="text-sm text-white/80">Validando acesso único no servidor...</p>
          </div>
        )}

        {error && (
          <div className="max-w-sm w-full bg-[#141418] border border-[#27272E] rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/15 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-400" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display text-base font-bold text-white">Instante indisponível</h3>
              <p className="text-xs text-[#9A98A1] leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] rounded-xl bg-[#FF5A1F] text-white text-sm font-medium"
            >
              Voltar
            </button>
          </div>
        )}

        {!loading && !error && imageUrl && (
          <img
            src={imageUrl}
            alt="Instante efêmero de visualização única"
            draggable={false}
            className="max-h-full max-w-full rounded-2xl object-contain pointer-events-none"
          />
        )}
      </div>

      {/* Caption Footer */}
      {!loading && !error && (
        <div className="relative z-10 p-6 pb-safe bg-gradient-to-t from-black/85 to-transparent text-center space-y-2">
          {instant.caption && (
            <p className="text-sm sm:text-base text-white font-medium max-w-lg mx-auto">
              {instant.caption}
            </p>
          )}
          <p className="text-[11px] text-white/60 flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#FF5A1F]" />
            <span>Esta imagem será destruída permanentemente ao fechar</span>
          </p>
        </div>
      )}
    </div>
  );
};
