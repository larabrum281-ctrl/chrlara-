import React from 'react';
import {Bell, Check} from 'lucide-react';
import {markNotificationAsRead} from '../lib/flashService';
import type {AppTab, NotificationItem} from '../types/flash';

interface Props {
  notifications: NotificationItem[];
  onNavigate: (tab: AppTab) => void;
}

export const NotificationsPanel: React.FC<Props> = ({notifications, onNavigate}) => {
  const sorted = [...notifications].sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? Date.now();
    const tb = b.createdAt?.toMillis?.() ?? Date.now();
    return tb - ta;
  });

  const handleTap = async (item: NotificationItem) => {
    if (!item.read) {
      await markNotificationAsRead(item.id);
    }
    if (item.type === 'friend_request' || item.type === 'friend_accepted') {
      onNavigate('friends');
    } else if (item.type === 'message') {
      onNavigate('chat');
    } else {
      onNavigate('instants');
    }
  };

  return (
    <div className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#C7C5CE] flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-[#FF5A1F]" />
          <span>Atividade</span>
        </h3>
        <span className="text-xs font-mono-num text-[#9A98A1]">
          {sorted.filter((n) => !n.read).length} não lida(s)
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-[#9A98A1] py-3">Sem notificações recentes.</p>
      ) : (
        <div className="divide-y divide-[#232329] max-h-72 overflow-y-auto">
          {sorted.slice(0, 15).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void handleTap(n)}
              className={`w-full text-left py-2.5 flex items-start justify-between gap-2.5 hover:bg-[#1A1A20] px-2 -mx-2 rounded-lg transition-colors ${
                n.read ? 'opacity-65' : ''
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs text-[#F6F5F0] leading-snug">{n.message}</p>
                <p className="text-[11px] text-[#9A98A1] font-mono-num">
                  {n.createdAt?.toDate
                    ? n.createdAt
                        .toDate()
                        .toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})
                    : 'Agora'}
                </p>
              </div>
              {!n.read && <Check className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0 mt-0.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
