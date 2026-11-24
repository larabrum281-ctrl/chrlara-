import React, {useEffect, useMemo, useState} from 'react';
import {Camera, CheckCheck, Clock, Eye, Lock} from 'lucide-react';
import {markInstantExpired} from '../lib/flashService';
import type {Instant, UserProfile} from '../types/flash';

interface Props {
  me: UserProfile;
  instants: Instant[];
  onOpenInstant: (instant: Instant) => void;
  onGoToCamera: () => void;
}

export const InstantsFeed: React.FC<Props> = ({
  me,
  instants,
  onOpenInstant,
  onGoToCamera,
}) => {
  const [tab, setTab] = useState<'received' | 'sent'>('received');
  const [stillFailed, setStillFailed] = useState(false);

  const sorted = useMemo(() => {
    return [...instants].sort((a, b) => {
      const ta = a.receivedAt?.toMillis?.() ?? Date.now();
      const tb = b.receivedAt?.toMillis?.() ?? Date.now();
      return tb - ta;
    });
  }, [instants]);

  const received = useMemo(
    () => sorted.filter((i) => i.recipientId === me.uid),
    [sorted, me.uid]
  );
  const sent = useMemo(
    () => sorted.filter((i) => i.senderId === me.uid),
    [sorted, me.uid]
  );

  // Clean up any unopened instants whose 24h TTL has elapsed
  useEffect(() => {
    const now = Date.now();
    sorted.forEach((inst) => {
      const exp = inst.expiresAt?.toMillis?.();
      if (inst.status === 'unopened' && exp && now >= exp) {
        void markInstantExpired(inst);
      }
    });
  }, [sorted]);

  const activeList = tab === 'received' ? received : sent;
  const unopenedCount = received.filter((i) => i.status === 'unopened').length;

  const formatDate = (ts?: {toDate?: () => Date}) => {
    if (!ts?.toDate) return 'Agora';
    return ts.toDate().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F6F5F0]">Instantes</h2>
          <p className="text-xs text-[#9A98A1]">
            {unopenedCount > 0
              ? `${unopenedCount} instante(s) aguardando abertura única`
              : 'Fotos efêmeras que somem após a visualização'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#141418] border border-[#27272E] rounded-xl">
          <button
            type="button"
            onClick={() => setTab('received')}
            className={`min-h-[38px] px-3.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              tab === 'received'
                ? 'bg-[#FF5A1F] text-white'
                : 'text-[#9A98A1] hover:text-white'
            }`}
          >
            Recebidos ({received.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('sent')}
            className={`min-h-[38px] px-3.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              tab === 'sent'
                ? 'bg-[#FF5A1F] text-white'
                : 'text-[#9A98A1] hover:text-white'
            }`}
          >
            Enviados ({sent.length})
          </button>
        </div>
      </div>

      {activeList.length === 0 ? (
        <div className="bg-[#141418] border border-[#27272E] rounded-2xl overflow-hidden">
          {!stillFailed && (
            <div className="h-48 w-full overflow-hidden border-b border-[#232329]">
              <img
                src="/src/assets/images/flash_shutter_still_1795529115361.jpg"
                alt="Lente fotográfica e prisma em superfície escura"
                referrerPolicy="no-referrer"
                onError={() => setStillFailed(true)}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6 text-center space-y-3">
            <h3 className="font-display text-base font-bold text-[#F6F5F0]">
              {tab === 'received'
                ? 'Nenhum instante recebido ainda'
                : 'Você ainda não enviou instantes'}
            </h3>
            <p className="text-xs text-[#9A98A1] max-w-sm mx-auto leading-relaxed">
              Capture um momento pela câmera e envie para um amigo. Ele só poderá abrir uma vez.
            </p>
            <button
              type="button"
              onClick={onGoToCamera}
              className="min-h-[44px] px-5 rounded-xl bg-[#FF5A1F] text-white text-xs font-semibold hover:bg-[#e54d15] transition-colors inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Tirar foto agora</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {activeList.map((inst) => {
            const isReceived = inst.recipientId === me.uid;
            const isExpired =
              inst.status === 'expired' ||
              (inst.expiresAt?.toMillis ? Date.now() >= inst.expiresAt.toMillis() : false);
            const canOpen = isReceived && inst.status === 'unopened' && !isExpired;

            return (
              <div
                key={inst.id}
                className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border ${
                      canOpen
                        ? 'bg-[#FF5A1F]/15 border-[#FF5A1F] text-[#FF5A1F]'
                        : 'bg-[#1E1E24] border-[#2E2E36] text-[#9A98A1]'
                    }`}
                  >
                    {canOpen ? (
                      <Eye className="w-5 h-5" />
                    ) : inst.status === 'viewed' ? (
                      <CheckCheck className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Lock className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-[#F6F5F0] truncate">
                      {isReceived ? inst.senderName : `Para ${inst.recipientName}`}
                    </p>
                    <p className="text-xs text-[#9A98A1] truncate">
                      {isReceived ? `@${inst.senderUsername}` : 'Instante único'} ·{' '}
                      <span className="font-mono-num">{inst.durationSeconds}s</span> ·{' '}
                      {formatDate(inst.receivedAt)}
                    </p>
                    {inst.caption && inst.status === 'unopened' && isReceived && (
                      <p className="text-xs text-[#C7C5CE] truncate pt-0.5">“{inst.caption}”</p>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {canOpen ? (
                    <button
                      type="button"
                      onClick={() => onOpenInstant(inst)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#FF5A1F] text-white text-xs font-semibold hover:bg-[#e54d15] transition-colors whitespace-nowrap"
                    >
                      Abrir agora
                    </button>
                  ) : inst.status === 'viewed' ? (
                    <div className="text-right">
                      <span className="text-xs font-medium text-emerald-400 block">
                        Visualizado
                      </span>
                      <span className="text-[11px] text-[#9A98A1] font-mono-num">
                        {inst.viewedAt ? formatDate(inst.viewedAt) : 'Aberto 1x'}
                      </span>
                    </div>
                  ) : isExpired ? (
                    <span className="text-xs font-medium text-[#9A98A1] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Expirado
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-300">Aguardando</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
