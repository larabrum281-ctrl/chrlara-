import {useCallback, useEffect, useState} from 'react';
import {onAuthStateChanged, type User} from 'firebase/auth';
import {collection, doc, onSnapshot, query, where} from 'firebase/firestore';
import {Bell, Camera, MessageCircle, User as UserIcon, Users, X, Zap} from 'lucide-react';
import {AuthScreen} from './components/AuthScreen';
import {CameraComposer} from './components/CameraComposer';
import {ChatPanel} from './components/ChatPanel';
import {FriendsPanel} from './components/FriendsPanel';
import {InstantsFeed} from './components/InstantsFeed';
import {InstantViewerModal} from './components/InstantViewerModal';
import {NotificationsPanel} from './components/NotificationsPanel';
import {OfflineIndicator} from './components/OfflineIndicator';
import {ProfilePanel} from './components/ProfilePanel';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SplashScreen} from './components/SplashScreen';
import {UsernameSetupModal} from './components/UsernameSetupModal';
import {auth, db, handleFirestoreError, OperationType} from './lib/firebase';
import {getUserProfile} from './lib/flashService';
import type {
  AppTab,
  Friendship,
  Instant,
  Message,
  NotificationItem,
  UserPrivateInfo,
  UserProfile,
} from './types/flash';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);

  const [tab, setTab] = useState<AppTab>('instants');
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [instants, setInstants] = useState<Instant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [viewingInstant, setViewingInstant] = useState<Instant | null>(null);
  const [cameraTargetFriend, setCameraTargetFriend] = useState<string | null>(null);
  const [chatTargetFriend, setChatTargetFriend] = useState<string | null>(null);
  const [mobileNotifOpen, setMobileNotifOpen] = useState(false);

  // Brief native-like splash screen on boot
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 450);
    return () => clearTimeout(t);
  }, []);

  const loadProfile = useCallback(async (user: User) => {
    setProfileLoading(true);
    try {
      const prof = await getUserProfile(user.uid);
      setProfile(prof);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        await loadProfile(user);
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [loadProfile]);

  const handleVerifiedRefresh = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    setFirebaseUser({...updated} as User);
    if (updated.emailVerified) {
      await loadProfile(updated);
    }
  };

  // Real-time Firestore listeners (only attached once auth + emailVerified + profile are ready)
  useEffect(() => {
    if (!authReady || !firebaseUser?.emailVerified || !profile) {
      setFriendships([]);
      setInstants([]);
      setMessages([]);
      setNotifications([]);
      setPrivateInfo(null);
      return;
    }

    const uid = profile.uid;

    const unsubPrivate = onSnapshot(
      doc(db, 'users', uid, 'private', 'info'),
      (snap) => {
        if (snap.exists()) setPrivateInfo(snap.data() as UserPrivateInfo);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/private/info`)
    );

    const unsubFriends = onSnapshot(
      query(collection(db, 'friendships'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        setFriendships(snap.docs.map((d) => d.data() as Friendship));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
    );

    const unsubInstants = onSnapshot(
      query(collection(db, 'instants'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        setInstants(snap.docs.map((d) => d.data() as Instant));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'instants')
    );

    const unsubMessages = onSnapshot(
      query(collection(db, 'messages'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        setMessages(snap.docs.map((d) => d.data() as Message));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'messages')
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', uid)),
      (snap) => {
        setNotifications(snap.docs.map((d) => d.data() as NotificationItem));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubPrivate();
      unsubFriends();
      unsubInstants();
      unsubMessages();
      unsubNotifs();
    };
  }, [authReady, firebaseUser?.uid, firebaseUser?.emailVerified, profile?.uid]);

  if (!authReady || !splashDone || profileLoading) {
    return <SplashScreen />;
  }

  if (!firebaseUser) {
    return (
      <>
        <AuthScreen unverifiedUser={null} onVerifiedRefresh={handleVerifiedRefresh} />
        <OfflineIndicator />
      </>
    );
  }

  if (!firebaseUser.emailVerified) {
    return (
      <>
        <AuthScreen unverifiedUser={firebaseUser} onVerifiedRefresh={handleVerifiedRefresh} />
        <OfflineIndicator />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <UsernameSetupModal user={firebaseUser} onCompleted={(p) => setProfile(p)} />
        <OfflineIndicator />
      </>
    );
  }

  const acceptedFriends = friendships.filter((f) => f.status === 'accepted');
  const pendingCount = friendships.filter(
    (f) => f.status === 'pending' && f.recipientId === profile.uid
  ).length;
  const unopenedInstantsCount = instants.filter(
    (i) => i.recipientId === profile.uid && i.status === 'unopened'
  ).length;
  const unreadMessagesCount = messages.filter(
    (m) => m.recipientId === profile.uid && !m.read
  ).length;
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  const navItems: {id: AppTab; label: string; icon: typeof Zap; badge?: number}[] = [
    {id: 'instants', label: 'Instantes', icon: Zap, badge: unopenedInstantsCount},
    {id: 'camera', label: 'Câmera', icon: Camera},
    {id: 'friends', label: 'Amigos', icon: Users, badge: pendingCount},
    {id: 'chat', label: 'Chat', icon: MessageCircle, badge: unreadMessagesCount},
    {id: 'profile', label: 'Perfil', icon: UserIcon},
  ];

  const handleSendInstantTo = (friendUid: string) => {
    setCameraTargetFriend(friendUid);
    setTab('camera');
  };

  const handleOpenChatWith = (friendUid: string) => {
    setChatTargetFriend(friendUid);
    setTab('chat');
  };

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F6F5F0]">
      {/* Mobile Top Bar (compact 52px) */}
      <header className="md:hidden sticky top-0 z-30 h-[52px] px-4 bg-[#0B0B0D]/90 backdrop-blur-md border-b border-[#232329] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#FF5A1F] fill-[#FF5A1F]" />
          <span className="font-display text-base font-extrabold tracking-tight">FLASH</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileNotifOpen(true)}
          aria-label="Abrir notificações"
          className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#C7C5CE] hover:text-white"
        >
          <Bell className="w-5 h-5" />
          {unreadNotifCount > 0 && (
            <span className="absolute top-2 right-2 font-mono-num text-[10px] font-bold bg-[#FF5A1F] text-white px-1 rounded-full leading-tight">
              {unreadNotifCount}
            </span>
          )}
        </button>
      </header>

      {/* Desktop + Mobile Responsive Workspace */}
      <div className="max-w-6xl mx-auto md:px-6 md:py-6 grid grid-cols-1 md:grid-cols-12 gap-6 pb-24 md:pb-10">
        {/* Desktop Left Sidebar */}
        <aside className="hidden md:flex md:col-span-3 flex-col justify-between bg-[#141418] border border-[#27272E] rounded-2xl p-4 h-[calc(100vh-3rem)] sticky top-6">
          <div className="space-y-6">
            <div className="px-2 pt-1 flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-[#FF5A1F] fill-[#FF5A1F]" />
              <span className="font-display text-lg font-extrabold tracking-tight">FLASH</span>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`w-full min-h-[44px] px-3 rounded-xl flex items-center justify-between text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#FF5A1F] text-white'
                        : 'text-[#C7C5CE] hover:bg-[#1C1C22] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge && item.badge > 0 ? (
                      <span
                        className={`font-mono-num text-xs px-1.5 py-0.5 rounded-md ${
                          active ? 'bg-black/25 text-white' : 'bg-[#232329] text-[#FF5A1F]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-3 pt-4 border-t border-[#232329]">
            <PWAInstallButton />
            <div className="px-2 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#232329] flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                {profile.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile.displayName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{profile.displayName}</p>
                <p className="text-[11px] text-[#9A98A1] truncate">@{profile.username}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Main Stage */}
        <main className="md:col-span-6 px-4 pt-4 md:p-0">
          {tab === 'instants' && (
            <InstantsFeed
              me={profile}
              instants={instants}
              onOpenInstant={(inst) => setViewingInstant(inst)}
              onGoToCamera={() => setTab('camera')}
            />
          )}
          {tab === 'camera' && (
            <CameraComposer
              me={profile}
              acceptedFriends={acceptedFriends}
              preselectedFriendId={cameraTargetFriend}
              onSent={() => setTab('instants')}
              onGoToFriends={() => setTab('friends')}
            />
          )}
          {tab === 'friends' && (
            <FriendsPanel
              me={profile}
              friendships={friendships}
              onSendInstantTo={handleSendInstantTo}
              onOpenChatWith={handleOpenChatWith}
            />
          )}
          {tab === 'chat' && (
            <ChatPanel
              me={profile}
              acceptedFriends={acceptedFriends}
              messages={messages}
              selectedFriendId={chatTargetFriend}
              onSelectFriend={(uid) => setChatTargetFriend(uid)}
              onSendInstantTo={handleSendInstantTo}
            />
          )}
          {tab === 'profile' && (
            <ProfilePanel
              me={profile}
              privateInfo={privateInfo}
              onUpdated={() => loadProfile(firebaseUser)}
            />
          )}
        </main>

        {/* Desktop Right Context Rail */}
        <aside className="hidden md:flex md:col-span-3 flex-col gap-5 sticky top-6 self-start">
          <NotificationsPanel notifications={notifications} onNavigate={(t) => setTab(t)} />

          <div className="bg-[#141418] border border-[#27272E] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#C7C5CE]">Envio rápido</h3>
              <span className="text-xs font-mono-num text-[#9A98A1]">
                {acceptedFriends.length}
              </span>
            </div>
            {acceptedFriends.length === 0 ? (
              <p className="text-xs text-[#9A98A1]">
                Adicione amigos para enviar instantes em 1 toque.
              </p>
            ) : (
              <div className="space-y-2">
                {acceptedFriends.slice(0, 6).map((f) => {
                  const isReq = f.requesterId === profile.uid;
                  const fUid = isReq ? f.recipientId : f.requesterId;
                  const fName = isReq ? f.recipientName : f.requesterName;
                  const fUser = isReq ? f.recipientUsername : f.requesterUsername;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleSendInstantTo(fUid)}
                      className="w-full min-h-[44px] px-2.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#232329] hover:border-[#FF5A1F] flex items-center justify-between gap-2 text-left transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F6F5F0] truncate">{fName}</p>
                        <p className="text-[11px] text-[#9A98A1] truncate">@{fUser}</p>
                      </div>
                      <Camera className="w-4 h-4 text-[#FF5A1F] shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Navegação principal"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0B0B0D]/95 backdrop-blur-md border-t border-[#232329] pb-safe"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-[#FF5A1F]' : 'text-[#9A98A1]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span className="absolute top-1.5 right-3 font-mono-num text-[10px] font-bold bg-[#FF5A1F] text-white px-1 rounded-full leading-tight">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Notifications Sheet */}
      {mobileNotifOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end">
          <div className="w-full bg-[#141418] border-t border-[#27272E] rounded-t-3xl p-4 pb-8 space-y-3">
            <div className="w-10 h-1.5 bg-[#2E2E36] rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Notificações</h3>
              <button
                type="button"
                onClick={() => setMobileNotifOpen(false)}
                aria-label="Fechar notificações"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#9A98A1]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NotificationsPanel
              notifications={notifications}
              onNavigate={(t) => {
                setTab(t);
                setMobileNotifOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Backend-Gated View-Once Instant Modal */}
      {viewingInstant && (
        <InstantViewerModal
          instant={viewingInstant}
          me={profile}
          onClose={() => setViewingInstant(null)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
