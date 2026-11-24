import React, {useState} from 'react';
import {Download, Share, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface Props {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<Props> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={() => void install()}
        className={`flex items-center justify-center gap-2 rounded-xl bg-[#FF5A1F] text-white font-medium text-sm hover:bg-[#e54d15] transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
          compact ? 'px-3 py-2' : 'w-full px-4 py-2.5'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Instalar aplicativo</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className={`flex items-center justify-center gap-2 rounded-xl border border-[#27272E] bg-[#141418] text-[#F6F5F0] font-medium text-sm hover:bg-[#1C1C22] transition-colors whitespace-nowrap shrink-0 min-h-[44px] ${
          compact ? 'px-3 py-2' : 'w-full px-4 py-2.5'
        }`}
      >
        <Download className="w-4 h-4 text-[#FF5A1F] shrink-0" />
        <span>{isIOS ? 'Instalar no iPhone' : 'Instalar app'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#141418] border border-[#27272E] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#F6F5F0]">
                Adicionar FLASH à tela inicial
              </h3>
              <button
                onClick={() => setShowGuide(false)}
                aria-label="Fechar instruções"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#9A98A1] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-3 text-sm text-[#C7C5CE]">
                <li className="flex items-start gap-2.5">
                  <span className="font-mono-num text-xs text-[#FF5A1F] pt-0.5">01</span>
                  <span>
                    Toque no botão <strong className="text-white inline-flex items-center gap-1">Compartilhar <Share className="w-3.5 h-3.5" /></strong> na barra do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono-num text-xs text-[#FF5A1F] pt-0.5">02</span>
                  <span>
                    Role até <strong className="text-white">Adicionar à Tela de Início</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono-num text-xs text-[#FF5A1F] pt-0.5">03</span>
                  <span>Confirme em <strong className="text-white">Adicionar</strong> para abrir em tela cheia.</span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-3 text-sm text-[#C7C5CE]">
                <li className="flex items-start gap-2.5">
                  <span className="font-mono-num text-xs text-[#FF5A1F] pt-0.5">01</span>
                  <span>Abra o menu do navegador (três pontos no canto superior).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono-num text-xs text-[#FF5A1F] pt-0.5">02</span>
                  <span>
                    Selecione <strong className="text-white">Instalar aplicativo</strong> ou{' '}
                    <strong className="text-white">Adicionar à tela inicial</strong>.
                  </span>
                </li>
              </ol>
            )}

            <button
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#232329] text-sm font-medium text-[#F6F5F0] hover:bg-[#2C2C34] transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
