import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Camera, Send} from 'lucide-react';
import {markMessageAsRead, sendDirectMessage} from '../lib/flashService';
import type {Friendship, Message, UserProfile} from '../types/flash';

interface Props {
  me: UserProfile;
  acceptedFriends: Friendship[];
  messages: Message[];
  selectedFriendId: string | null;
  onSelectFriend: (uid: string) => void;
  onSendInstantTo: (uid: string) => void;
}

export const ChatPanel: React.FC<Props> = ({
  me,
  acceptedFriends,
  messages,
  selectedFriendId,
  onSelectFriend,
  onSendInstantTo,
}) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const friendsList = useMemo(
    () =>
      acceptedFriends.map((f) => {
        const isReq = f.requesterId === me.uid;
        return {
          uid: isReq ? f.recipientId : f.requesterId,
          name: isReq ? f.recipientName : f.requesterName,
          username: isReq ? f.recipientUsername : f.requesterUsername,
          photo: isReq ? f.recipientPhoto : f.requesterPhoto,
        };
      }),
    [acceptedFriends, me.uid]
  );

  const activeUid = selectedFriendId || friendsList[0]?.uid || null;
  const activeFriend = friendsList.find((f) => f.uid === activeUid) || null;

  const threadMessages = useMemo(() => {
    if (!activeUid) return [];
    return messages
      .filter(
        (m) =>
          (m.senderId === me.uid && m.recipientId === activeUid) ||
          (m.senderId === activeUid && m.recipientId === me.uid)
      )
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? Date.now();
        const tb = b.createdAt?.toMillis?.() ?? Date.now();
        return ta - tb;
      });
  }, [messages, activeUid, me.uid]);

  useEffect(() => {
    threadMessages.forEach((m) => {
      if (m.recipientId === me.uid && !m.read) {
        void markMessageAsRead(m.id);
      }
    });
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [threadMessages, me.uid]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUid || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendDirectMessage({me, recipientId: activeUid, text});
      setText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  if (friendsList.length === 0) {
    return (
      <div className="bg-[#141418] border border-[#27272E] rounded-2xl p-8 text-center space-y-2">
        <h2 className="font-display text-lg font-bold text-[#F6F5F0]">Mensagens</h2>
        <p className="text-xs text-[#9A98A1]">
          Adicione amigos na aba Amigos para iniciar conversas privadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {friendsList.map((f) => {
          const unread = messages.filter(
            (m) => m.senderId === f.uid && m.recipientId === me.uid && !m.read
          ).length;
          const active = f.uid === activeUid;
          return (
            <button
              key={f.uid}
              type="button"
              onClick={() => onSelectFriend(f.uid)}
              className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#FF5A1F] border-[#FF5A1F] text-white'
                  : 'bg-[#141418] border-[#27272E] text-[#C7C5CE] hover:text-white'
              }`}
            >
              <span>{f.name}</span>
              {unread > 0 && (
                <span className="font-mono-num text-[11px] bg-black/30 px-1.5 py-0.5 rounded-md">
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeFriend && (
        <div className="bg-[#141418] border border-[#27272E] rounded-2xl flex flex-col h-[460px] sm:h-[520px]">
          <div className="px-4 py-3 border-b border-[#232329] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#F6F5F0] truncate">{activeFriend.name}</p>
              <p className="text-xs text-[#9A98A1] truncate">@{activeFriend.username}</p>
            </div>
            <button
              type="button"
              onClick={() => onSendInstantTo(activeFriend.uid)}
              className="min-h-[40px] px-3 rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-xs font-medium text-white hover:bg-[#272730] flex items-center gap-1.5 shrink-0"
            >
              <Camera className="w-3.5 h-3.5 text-[#FF5A1F]" />
              <span>Enviar Flash</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {threadMessages.length === 0 ? (
              <p className="text-xs text-[#9A98A1] text-center py-8">
                Nenhuma mensagem ainda. Diga oi para {activeFriend.name}!
              </p>
            ) : (
              threadMessages.map((m) => {
                const mine = m.senderId === me.uid;
                const time = m.createdAt?.toDate
                  ? m.createdAt
                      .toDate()
                      .toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})
                  : '';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm space-y-1 ${
                        mine
                          ? 'bg-[#FF5A1F] text-white'
                          : 'bg-[#1E1E24] text-[#F6F5F0] border border-[#2E2E36]'
                      }`}
                    >
                      <p className="leading-snug break-words">{m.text}</p>
                      <p
                        className={`text-[10px] font-mono-num text-right ${
                          mine ? 'text-white/75' : 'text-[#9A98A1]'
                        }`}
                      >
                        {time}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="px-4 pb-2 text-xs text-red-300">{error}</p>}

          <form
            onSubmit={(e) => void handleSend(e)}
            className="p-3 border-t border-[#232329] flex items-center gap-2"
          >
            <input
              type="text"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Mensagem para @${activeFriend.username}...`}
              className="flex-1 min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-3.5 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              aria-label="Enviar mensagem"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#FF5A1F] text-white flex items-center justify-center hover:bg-[#e54d15] transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
