import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {deleteObject, getDownloadURL, ref, uploadBytes, uploadString} from 'firebase/storage';
import {auth, db, handleFirestoreError, OperationType, storage} from './firebase';
import type {Friendship, Instant, UserProfile} from '../types/flash';

export function makeFriendshipId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

export function sanitizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function generateId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${Date.now()}_${rand}`;
}

function safePhotoUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 1000) return undefined;
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) return undefined;
  return trimmed;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuário não autenticado.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const clean = sanitizeUsername(username);
  if (!isValidUsernameFormat(clean)) return false;
  const path = `usernames/${clean}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', clean));
    return !snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function claimProfileAndPrivateInfo(params: {
  username: string;
  displayName: string;
  bio?: string;
}): Promise<UserProfile> {
  const user = auth.currentUser;
  if (!user) throw new Error('Autenticação necessária.');
  if (!user.emailVerified) throw new Error('Confirme seu e-mail antes de criar seu perfil.');

  const cleanUsername = sanitizeUsername(params.username);
  if (!isValidUsernameFormat(cleanUsername)) {
    throw new Error('O @usuário deve ter 3 a 24 caracteres (letras minúsculas, números ou _).');
  }

  const displayName = params.displayName.trim().slice(0, 60);
  if (!displayName) {
    throw new Error('Informe um nome de exibição.');
  }

  const bio = (params.bio ?? '').trim().slice(0, 160);
  const photoURL = safePhotoUrl(user.photoURL);

  // Check availability first
  const claimRef = doc(db, 'usernames', cleanUsername);
  try {
    const existingClaim = await getDoc(claimRef);
    if (existingClaim.exists() && existingClaim.data().uid !== user.uid) {
      throw new Error('Este @usuário já está em uso.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('já está em uso')) throw error;
    handleFirestoreError(error, OperationType.GET, `usernames/${cleanUsername}`);
  }

  const batch = writeBatch(db);
  const profilePayload: Record<string, unknown> = {
    uid: user.uid,
    username: cleanUsername,
    displayName,
    bio,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (photoURL) profilePayload.photoURL = photoURL;

  batch.set(doc(db, 'users', user.uid), profilePayload);
  batch.set(claimRef, {
    uid: user.uid,
    username: cleanUsername,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', user.uid, 'private', 'info'), {
    uid: user.uid,
    email: (user.email || 'no-email@flash.app').slice(0, 254),
    pushEnabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }

  const created = await getUserProfile(user.uid);
  if (!created) throw new Error('Falha ao carregar perfil criado.');
  return created;
}

export async function updateProfileInfo(params: {
  displayName: string;
  bio: string;
  photoURL?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado.');
  const path = `users/${user.uid}`;

  const payload: Record<string, unknown> = {
    displayName: params.displayName.trim().slice(0, 60),
    bio: params.bio.trim().slice(0, 160),
    updatedAt: serverTimestamp(),
  };
  const validPhoto = safePhotoUrl(params.photoURL);
  if (validPhoto) {
    payload.photoURL = validPhoto;
  }

  try {
    await updateDoc(doc(db, 'users', user.uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function uploadProfileAvatar(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado.');
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const avatarRef = ref(storage, `avatars/${user.uid}/avatar_${Date.now()}.${ext}`);
  await uploadBytes(avatarRef, file, {contentType: file.type || 'image/jpeg'});
  return await getDownloadURL(avatarRef);
}

export async function updatePushPreference(pushEnabled: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado.');
  const path = `users/${user.uid}/private/info`;
  try {
    await updateDoc(doc(db, 'users', user.uid, 'private', 'info'), {
      pushEnabled,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function searchProfiles(searchTerm: string): Promise<UserProfile[]> {
  const clean = sanitizeUsername(searchTerm.replace(/^@/, ''));
  if (!clean) {
    const path = 'users';
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(20)));
      return snap.docs.map((d) => d.data() as UserProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  // Try exact username match first
  const exactPath = `usernames/${clean}`;
  try {
    const claimSnap = await getDoc(doc(db, 'usernames', clean));
    if (claimSnap.exists()) {
      const uid = claimSnap.data().uid as string;
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        return [userSnap.data() as UserProfile];
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, exactPath);
  }

  // Fallback prefix query on public users
  const listPath = 'users';
  try {
    const q = query(
      collection(db, 'users'),
      where('username', '>=', clean),
      where('username', '<=', `${clean}\uf8ff`),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, listPath);
  }
}

export async function sendFriendRequest(
  me: UserProfile,
  target: UserProfile
): Promise<void> {
  if (me.uid === target.uid) throw new Error('Você não pode adicionar a si mesmo.');
  const friendshipId = makeFriendshipId(me.uid, target.uid);
  const path = `friendships/${friendshipId}`;

  const existingSnap = await getDoc(doc(db, 'friendships', friendshipId)).catch((error) =>
    handleFirestoreError(error, OperationType.GET, path)
  );

  if (existingSnap.exists()) {
    const status = (existingSnap.data() as Friendship).status;
    if (status === 'accepted') throw new Error('Vocês já são amigos.');
    if (status === 'pending') throw new Error('Solicitação já enviada.');
    // If previously declined, clear it before recreating
    await deleteDoc(doc(db, 'friendships', friendshipId)).catch((error) =>
      handleFirestoreError(error, OperationType.DELETE, path)
    );
  }

  const batch = writeBatch(db);
  const payload: Record<string, unknown> = {
    id: friendshipId,
    participantIds: [me.uid, target.uid].sort(),
    requesterId: me.uid,
    recipientId: target.uid,
    requesterName: me.displayName,
    requesterUsername: me.username,
    recipientName: target.displayName,
    recipientUsername: target.username,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (safePhotoUrl(me.photoURL)) payload.requesterPhoto = safePhotoUrl(me.photoURL);
  if (safePhotoUrl(target.photoURL)) payload.recipientPhoto = safePhotoUrl(target.photoURL);

  batch.set(doc(db, 'friendships', friendshipId), payload);

  const notifId = generateId('notif');
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: target.uid,
    actorId: me.uid,
    actorName: me.displayName,
    type: 'friend_request',
    entityId: friendshipId,
    message: `${me.displayName} (@${me.username}) enviou uma solicitação de amizade.`,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function respondFriendRequest(
  friendship: Friendship,
  me: UserProfile,
  decision: 'accepted' | 'declined'
): Promise<void> {
  const path = `friendships/${friendship.id}`;
  const batch = writeBatch(db);
  batch.update(doc(db, 'friendships', friendship.id), {
    status: decision,
    updatedAt: serverTimestamp(),
  });

  if (decision === 'accepted') {
    const notifId = generateId('notif');
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: friendship.requesterId,
      actorId: me.uid,
      actorName: me.displayName,
      type: 'friend_accepted',
      entityId: friendship.id,
      message: `${me.displayName} aceitou seu pedido de amizade.`,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const path = `friendships/${friendshipId}`;
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendViewOnceInstant(params: {
  me: UserProfile;
  recipientId: string;
  recipientName: string;
  imageDataUrl: string;
  caption: string;
  durationSeconds: number;
}): Promise<string> {
  const instantId = generateId('inst');
  const duration = Math.min(15, Math.max(3, Math.round(params.durationSeconds)));
  const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000; // 24h auto-expiration
  const storagePath = `instants/${params.me.uid}/${instantId}.jpg`;

  // 1. Register in backend View-Once Vault first (guarantees single-use control)
  const headers = await getAuthHeaders();
  const regRes = await fetch('/api/instants/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      instantId,
      recipientId: params.recipientId,
      durationSeconds: duration,
      expiresAtMs,
      storagePath,
      imageDataUrl: params.imageDataUrl,
    }),
  });

  if (!regRes.ok) {
    const data = await regRes.json().catch(() => ({}));
    throw new Error(data.error || 'Falha ao registrar instante no servidor.');
  }

  // 2. Upload to Firebase Storage (best-effort if Storage bucket is enabled on project)
  try {
    const storageRef = ref(storage, storagePath);
    await uploadString(storageRef, params.imageDataUrl, 'data_url', {
      contentType: 'image/jpeg',
      customMetadata: {
        recipientId: params.recipientId,
        instantId,
      },
    });
  } catch (storageErr) {
    // Non-blocking if Storage isn't enabled on Starter Tier; backend vault still enforces media delivery
    console.warn('Firebase Storage upload skipped or unavailable:', storageErr);
  }

  // 3. Persist metadata + notification in Cloud Firestore
  const batch = writeBatch(db);
  const instantPayload: Record<string, unknown> = {
    id: instantId,
    senderId: params.me.uid,
    senderName: params.me.displayName,
    senderUsername: params.me.username,
    recipientId: params.recipientId,
    recipientName: params.recipientName,
    participantIds: [params.me.uid, params.recipientId].sort(),
    caption: params.caption.trim().slice(0, 160),
    storagePath,
    durationSeconds: duration,
    status: 'unopened',
    viewedBy: '',
    receivedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    updatedAt: serverTimestamp(),
  };
  if (safePhotoUrl(params.me.photoURL)) {
    instantPayload.senderPhoto = safePhotoUrl(params.me.photoURL);
  }

  batch.set(doc(db, 'instants', instantId), instantPayload);

  const notifId = generateId('notif');
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: params.recipientId,
    actorId: params.me.uid,
    actorName: params.me.displayName,
    type: 'instant_received',
    entityId: instantId,
    message: `${params.me.displayName} enviou um instante de visualização única.`,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    // Rollback backend vault if Firestore rejected the write
    await fetch(`/api/instants/${instantId}`, {method: 'DELETE', headers}).catch(() => {});
    handleFirestoreError(error, OperationType.WRITE, `instants/${instantId}`);
  }

  return instantId;
}

export async function openInstantOnce(
  instant: Instant,
  me: UserProfile
): Promise<{blobUrl: string; durationSeconds: number}> {
  if (instant.recipientId !== me.uid) {
    throw new Error('Apenas o destinatário pode abrir este instante.');
  }
  if (instant.status === 'viewed' || instant.status === 'expired') {
    throw new Error('Este instante já foi visualizado ou expirou.');
  }

  const user = auth.currentUser;
  if (!user) throw new Error('Sessão expirada.');
  const idToken = await user.getIdToken();

  // 1. Backend authorization + atomic first-view lock
  const openRes = await fetch(`/api/instants/${instant.id}/open`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!openRes.ok) {
    const errData = await openRes.json().catch(() => ({}));
    // Sync Firestore terminal state if backend confirms it was already opened/expired
    if (openRes.status === 410 || openRes.status === 404) {
      await updateDoc(doc(db, 'instants', instant.id), {
        status: openRes.status === 410 ? 'viewed' : 'expired',
        viewedBy: me.uid,
        viewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    throw new Error(errData.error || 'Não foi possível abrir este instante.');
  }

  const {viewToken, durationSeconds} = (await openRes.json()) as {
    viewToken: string;
    durationSeconds: number;
  };

  // 2. Fetch protected single-use image stream
  const mediaRes = await fetch(`/api/instants/${instant.id}/media`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'x-flash-view-token': viewToken,
    },
    cache: 'no-store',
  });

  if (!mediaRes.ok) {
    const errData = await mediaRes.json().catch(() => ({}));
    throw new Error(errData.error || 'Mídia indisponível ou já destruída.');
  }

  const blob = await mediaRes.blob();
  const blobUrl = URL.createObjectURL(blob);

  // 3. Lock Firestore document as viewed & notify sender
  const batch = writeBatch(db);
  batch.update(doc(db, 'instants', instant.id), {
    status: 'viewed',
    viewedBy: me.uid,
    viewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const notifId = generateId('notif');
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: instant.senderId,
    actorId: me.uid,
    actorName: me.displayName,
    type: 'instant_viewed',
    entityId: instant.id,
    message: `${me.displayName} abriu seu instante.`,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `instants/${instant.id}`);
  }

  // 4. Delete Firebase Storage object immediately after single view
  if (instant.storagePath) {
    void deleteObject(ref(storage, instant.storagePath)).catch(() => {});
  }

  return {blobUrl, durationSeconds};
}

export async function completeInstantView(instantId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await fetch(`/api/instants/${instantId}/complete`, {
      method: 'POST',
      headers,
    });
  } catch {
    // Non-fatal
  }
}

export async function markInstantExpired(instant: Instant): Promise<void> {
  const path = `instants/${instant.id}`;
  try {
    await updateDoc(doc(db, 'instants', instant.id), {
      status: 'expired',
      updatedAt: serverTimestamp(),
    });
    if (instant.storagePath) {
      void deleteObject(ref(storage, instant.storagePath)).catch(() => {});
    }
    const headers = await getAuthHeaders();
    await fetch(`/api/instants/${instant.id}`, {method: 'DELETE', headers}).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendDirectMessage(params: {
  me: UserProfile;
  recipientId: string;
  text: string;
  instantId?: string;
}): Promise<void> {
  const cleanText = params.text.trim().slice(0, 500);
  if (!cleanText) return;

  const messageId = generateId('msg');
  const path = `messages/${messageId}`;
  const batch = writeBatch(db);

  batch.set(doc(db, 'messages', messageId), {
    id: messageId,
    senderId: params.me.uid,
    recipientId: params.recipientId,
    participantIds: [params.me.uid, params.recipientId].sort(),
    text: cleanText,
    instantId: params.instantId || '',
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const notifId = generateId('notif');
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: params.recipientId,
    actorId: params.me.uid,
    actorName: params.me.displayName,
    type: 'message',
    entityId: messageId,
    message: `${params.me.displayName}: ${cleanText.slice(0, 80)}`,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const path = `messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'messages', messageId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
