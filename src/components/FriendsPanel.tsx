import React, {useState} from 'react';
import {Camera, Check, MessageCircle, Search, UserMinus, UserPlus, X} from 'lucide-react';
import {
  makeFriendshipId,
  removeFriendship,
  respondFriendRequest,
  searchProfiles,
  sendFriendRequest,
} from '../lib/flashService';
import type {Friendship, UserProfile} from '../types/flash';

interface Props {
  me: UserProfile;
  friendships: Friendship[];
  onSendInstantTo: (friendUid: string) => void;
  onOpenChatWith: (friendUid: string) => void;
}

export const FriendsPanel: React.FC<Props> = ({
  me,
  friendships,
  onSendInstantTo,
  onOpenChatWith,
}) => {
  const [queryText, setQueryText] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserProfile[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingIncoming = friendships.filter(
    (f) => f.status === 'pending' && f.recipientId === me.uid
  );
  const pendingOutgoing = friendships.filter(
    (f) => f.status === 'pending' && f.requesterId === me.uid
  );
  const accepted = friendships.filter((f) => f.status === 'accepted');

  const getRelationStatus = (otherUid: string): Friendship | undefined => {
    const id = makeFriendshipId(me.uid, otherUid);
    return friendships.find((f) => f.id === id);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setError(null);
    setFeedback(null);
    try {
      const list = await searchProfiles(queryText);
      setResults(list.filter((u) => u.uid !== me.uid));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar usuários.');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (target: UserProfile) => {
    setBusyId(target.uid);
    setError(null);
    setFeedback(null);
    try {
      await sendFriendRequest(me, target);
      setFeedback(`Solicitação enviada para @${target.username}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar solicitação.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRespond = async (f: Friendship, decision: 'accepted' | 'declined') => {
    setBusyId(f.id);
    setError(null);
    try {
      await respondFriendRequest(f, me, decision);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao responder solicitação.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (fId: string) => {
    setBusyId(fId);
    setError(null);
    try {
      await removeFriendship(fId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover amizade.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-[#F6F5F0]">Amigos</h2>
        <p className="text-xs text-[#9A98A1]">
          Adicione pessoas pelo @usuário para trocar instantes únicos e mensagens
        </p>
      </div>

      <form onSubmit={(e) => void handleSearch(e)} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#6B6973] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Buscar @usuario ou listar pessoas..."
            className="w-full min-h-[44px] rounded-xl bg-[#141418] border border-[#27272E] pl-10 pr-4 text-sm text-[#F6F5F0] placeholder:text-[#6B6973] focus:outline-none focus:border-[#FF5A1F]"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="min-h-[44px] px-4 rounded-xl bg-[#FF5A1F] text-white text-xs font-semibold hover:bg-[#e54d15] transition-colors whitespace-nowrap shrink-0"
        >
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && (
        <p className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl p-3">
          {error}
        </p>
      )}
      {feedback && (
        <p className="text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-3">
          {feedback}
        </p>
      )}

      {results !== null && (
        <section className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#C7C5CE]">
              Resultados da busca ({results.length})
            </h3>
            <button
              type="button"
              onClick={() => setResults(null)}
              className="text-xs text-[#9A98A1] hover:text-white"
            >
              Limpar
            </button>
          </div>
          {results.length === 0 ? (
            <p className="text-xs text-[#9A98A1] py-2">Nenhum usuário encontrado.</p>
          ) : (
            <div className="divide-y divide-[#232329]">
              {results.map((u) => {
                const rel = getRelationStatus(u.uid);
                return (
                  <div key={u.uid} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#232329] flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                        {u.photoURL ? (
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          u.displayName.slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#F6F5F0] truncate">
                          {u.displayName}
                        </p>
                        <p className="text-xs text-[#9A98A1] truncate">@{u.username}</p>
                      </div>
                    </div>
                    {rel?.status === 'accepted' ? (
                      <span className="text-xs text-emerald-400 shrink-0">Amigos</span>
                    ) : rel?.status === 'pending' ? (
                      <span className="text-xs text-amber-300 shrink-0">Pendente</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === u.uid}
                        onClick={() => void handleAdd(u)}
                        className="min-h-[40px] px-3 rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-xs font-medium text-white hover:bg-[#272730] flex items-center gap-1.5 shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-[#FF5A1F]" />
                        <span>Adicionar</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {pendingIncoming.length > 0 && (
        <section className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[#C7C5CE]">
            Solicitações recebidas ({pendingIncoming.length})
          </h3>
          <div className="divide-y divide-[#232329]">
            {pendingIncoming.map((req) => (
              <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#F6F5F0] truncate">
                    {req.requesterName}
                  </p>
                  <p className="text-xs text-[#9A98A1] truncate">@{req.requesterUsername}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void handleRespond(req, 'accepted')}
                    aria-label="Aceitar amizade"
                    className="min-h-[40px] px-3 rounded-xl bg-[#FF5A1F] text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Aceitar</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => void handleRespond(req, 'declined')}
                    aria-label="Recusar amizade"
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-[#9A98A1] hover:text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#C7C5CE]">
            Meus amigos ({accepted.length})
          </h3>
          {pendingOutgoing.length > 0 && (
            <span className="text-xs text-[#9A98A1] font-mono-num">
              {pendingOutgoing.length} pendente(s)
            </span>
          )}
        </div>

        {accepted.length === 0 ? (
          <p className="text-xs text-[#9A98A1] py-4 text-center">
            Você ainda não tem amigos adicionados. Use a busca acima para encontrar pessoas pelo
            @usuário.
          </p>
        ) : (
          <div className="divide-y divide-[#232329]">
            {accepted.map((f) => {
              const isReq = f.requesterId === me.uid;
              const friendUid = isReq ? f.recipientId : f.requesterId;
              const friendName = isReq ? f.recipientName : f.requesterName;
              const friendUsername = isReq ? f.recipientUsername : f.requesterUsername;
              const friendPhoto = isReq ? f.recipientPhoto : f.requesterPhoto;

              return (
                <div key={f.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#232329] flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                      {friendPhoto ? (
                        <img
                          src={friendPhoto}
                          alt={friendName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        friendName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F6F5F0] truncate">{friendName}</p>
                      <p className="text-xs text-[#9A98A1] truncate">@{friendUsername}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSendInstantTo(friendUid)}
                      aria-label={`Enviar instante para ${friendName}`}
                      className="min-h-[40px] px-3 rounded-xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/40 text-[#FF5A1F] text-xs font-semibold hover:bg-[#FF5A1F] hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Flash</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChatWith(friendUid)}
                      aria-label={`Conversar com ${friendName}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-[#F6F5F0] hover:bg-[#272730] flex items-center justify-center"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === f.id}
                      onClick={() => void handleRemove(f.id)}
                      aria-label={`Remover ${friendName}`}
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-[#1E1E24] border border-[#2E2E36] text-[#9A98A1] hover:text-red-400 flex items-center justify-center"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
