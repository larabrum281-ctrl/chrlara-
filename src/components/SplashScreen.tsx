import React from 'react';
import {Zap} from 'lucide-react';

export const SplashScreen: React.FC = () => {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B0B0D] text-[#F6F5F0]"
      aria-label="Carregando FLASH"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-[#141418] border border-[#27272E]">
          <Zap className="w-9 h-9 text-[#FF5A1F] fill-[#FF5A1F]" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#F6F5F0]">
            FLASH
          </h1>
          <p className="text-xs text-[#9A98A1]">Instantes de visualização única</p>
        </div>
      </div>
    </div>
  );
};
