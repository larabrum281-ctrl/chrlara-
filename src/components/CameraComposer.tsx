import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Camera, ImagePlus, RefreshCw, Send, Timer, Trash2, Users} from 'lucide-react';
import {sendViewOnceInstant} from '../lib/flashService';
import type {Friendship, UserProfile} from '../types/flash';

interface Props {
  me: UserProfile;
  acceptedFriends: Friendship[];
  preselectedFriendId?: string | null;
  onSent: () => void;
  onGoToFriends: () => void;
}

const DURATIONS = [3, 5, 10, 15];

export const CameraComposer: React.FC<Props> = ({
  me,
  acceptedFriends,
  preselectedFriendId,
  onSent,
  onGoToFriends,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [selectedFriendId, setSelectedFriendId] = useState<string>(preselectedFriendId || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashBurst, setFlashBurst] = useState(false);

  const friendsList = acceptedFriends.map((f) => {
    const isReq = f.requesterId === me.uid;
    return {
      uid: isReq ? f.recipientId : f.requesterId,
      name: isReq ? f.recipientName : f.requesterName,
      username: isReq ? f.recipientUsername : f.requesterUsername,
      photo: isReq ? f.recipientPhoto : f.requesterPhoto,
    };
  });

  useEffect(() => {
    if (preselectedFriendId) {
      setSelectedFriendId(preselectedFriendId);
    } else if (!selectedFriendId && friendsList.length > 0) {
      setSelectedFriendId(friendsList[0].uid);
    }
  }, [preselectedFriendId, friendsList.length]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmera indisponível neste navegador. Selecione uma foto do dispositivo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode, width: {ideal: 1280}, height: {ideal: 1600}},
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setCameraError('Permita o acesso à câmera ou envie uma foto da galeria.');
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (!capturedDataUrl) {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [capturedDataUrl, startCamera, stopCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;

    setFlashBurst(true);
    setTimeout(() => setFlashBurst(false), 180);

    const maxW = 1200;
    const vw = video.videoWidth || 720;
    const vh = video.videoHeight || 960;
    const scale = Math.min(1, maxW / vw);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    setCapturedDataUrl(dataUrl);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.84));
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError('Não foi possível ler a imagem selecionada.');
    };
    img.src = objectUrl;
  };

  const handleSend = async () => {
    if (!capturedDataUrl) return;
    const target = friendsList.find((f) => f.uid === selectedFriendId);
    if (!target) {
      setError('Selecione um amigo para enviar este instante.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await sendViewOnceInstant({
        me,
        recipientId: target.uid,
        recipientName: target.name,
        imageDataUrl: capturedDataUrl,
        caption,
        durationSeconds,
      });
      setCapturedDataUrl(null);
      setCaption('');
      onSent();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar instante.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F6F5F0]">Novo Instante</h2>
          <p className="text-xs text-[#9A98A1]">
            Visualização única · Expira automaticamente em 24h
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFilePick}
          className="hidden"
        />
        {!capturedDataUrl && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#141418] border border-[#27272E] text-xs font-medium text-[#F6F5F0] hover:bg-[#1E1E24] flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-4 h-4 text-[#FF5A1F]" />
            <span>Galeria</span>
          </button>
        )}
      </div>

      {!capturedDataUrl ? (
        <div className="relative aspect-[3/4] max-h-[540px] w-full rounded-2xl overflow-hidden bg-[#141418] border border-[#27272E]">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${
              facingMode === 'user' ? 'scale-x-[-1]' : ''
            } ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
          />

          {flashBurst && <div className="absolute inset-0 bg-white pointer-events-none" />}

          {!cameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-4 bg-[#141418]">
              <div className="w-14 h-14 rounded-2xl bg-[#1E1E24] border border-[#2E2E36] flex items-center justify-center">
                <Camera className="w-7 h-7 text-[#FF5A1F]" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-sm font-medium text-[#F6F5F0]">
                  {cameraError || 'Inicializando visor...'}
                </p>
                <p className="text-xs text-[#9A98A1]">
                  Você também pode escolher uma foto existente da galeria.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-4 rounded-xl bg-[#FF5A1F] text-white text-xs font-semibold hover:bg-[#e54d15] transition-colors"
              >
                Escolher foto do dispositivo
              </button>
            </div>
          )}

          {cameraReady && (
            <div className="absolute bottom-5 inset-x-0 flex items-center justify-center gap-8 px-6">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Selecionar da galeria"
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <ImagePlus className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleCapture}
                aria-label="Capturar instante"
                className="w-16 h-16 rounded-full bg-white p-1 border-4 border-[#FF5A1F] active:scale-95 transition-transform flex items-center justify-center"
              >
                <span className="w-full h-full rounded-full bg-[#FF5A1F]" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                aria-label="Alternar câmera"
                className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative aspect-[3/4] max-h-[440px] w-full rounded-2xl overflow-hidden bg-[#141418] border border-[#27272E]">
            <img
              src={capturedDataUrl}
              alt="Prévia do instante capturado"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => setCapturedDataUrl(null)}
              aria-label="Descartar foto"
              className="absolute top-3 right-3 min-h-[44px] min-w-[44px] rounded-xl bg-black/70 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-red-600/80 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="instant-caption" className="block text-xs font-medium text-[#C7C5CE]">
                Legenda (opcional)
              </label>
              <input
                id="instant-caption"
                type="text"
                maxLength={160}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escreva algo sobre este momento..."
                className="w-full min-h-[44px] rounded-xl bg-[#0B0B0D] border border-[#27272E] px-3.5 text-sm text-[#F6F5F0] focus:outline-none focus:border-[#FF5A1F]"
              />
            </div>

            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#C7C5CE]">
                <Timer className="w-3.5 h-3.5 text-[#FF5A1F]" />
                Tempo de visualização única
              </span>
              <div className="grid grid-cols-4 gap-2">
                {DURATIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDurationSeconds(sec)}
                    className={`min-h-[44px] rounded-xl font-mono-num text-xs font-semibold border transition-colors ${
                      durationSeconds === sec
                        ? 'bg-[#FF5A1F] border-[#FF5A1F] text-white'
                        : 'bg-[#0B0B0D] border-[#27272E] text-[#9A98A1] hover:text-white'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[#C7C5CE]">Enviar para</span>
              {friendsList.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#27272E] flex items-center justify-between gap-3">
                  <span className="text-xs text-[#9A98A1]">
                    Adicione amigos para enviar instantes.
                  </span>
                  <button
                    type="button"
                    onClick={onGoToFriends}
                    className="min-h-[40px] px-3 rounded-lg bg-[#1E1E24] text-xs font-medium text-white flex items-center gap-1.5 shrink-0"
                  >
                    <Users className="w-3.5 h-3.5 text-[#FF5A1F]" />
                    <span>Amigos</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {friendsList.map((friend) => {
                    const active = selectedFriendId === friend.uid;
                    return (
                      <button
                        key={friend.uid}
                        type="button"
                        onClick={() => setSelectedFriendId(friend.uid)}
                        className={`min-h-[48px] px-3 py-2 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${
                          active
                            ? 'bg-[#FF5A1F]/15 border-[#FF5A1F] text-[#F6F5F0]'
                            : 'bg-[#0B0B0D] border-[#27272E] text-[#C7C5CE] hover:border-[#3A3A44]'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-[#232329] flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                          {friend.photo ? (
                            <img
                              src={friend.photo}
                              alt={friend.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            friend.name.slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{friend.name}</p>
                          <p className="text-[11px] text-[#9A98A1] truncate">@{friend.username}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-300 bg-red-950/50 border border-red-800/60 rounded-xl p-3">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || friendsList.length === 0 || !selectedFriendId}
              className="w-full min-h-[48px] rounded-xl bg-[#FF5A1F] text-white font-semibold text-sm hover:bg-[#e54d15] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Enviando instante...' : 'Enviar visualização única'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
