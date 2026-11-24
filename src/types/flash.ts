import type {Timestamp} from 'firebase/firestore';

export type AppTab = 'instants' | 'camera' | 'friends' | 'chat' | 'profile';

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  pushEnabled: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Friendship {
  id: string;
  participantIds: string[];
  requesterId: string;
  recipientId: string;
  requesterName: string;
  requesterUsername: string;
  requesterPhoto?: string;
  recipientName: string;
  recipientUsername: string;
  recipientPhoto?: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Instant {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderPhoto?: string;
  recipientId: string;
  recipientName: string;
  participantIds: string[];
  caption: string;
  storagePath: string;
  durationSeconds: number;
  status: 'unopened' | 'viewing' | 'viewed' | 'expired';
  viewedBy: string;
  receivedAt: Timestamp;
  viewedAt?: Timestamp;
  expiresAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  participantIds: string[];
  text: string;
  instantId: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  type: 'friend_request' | 'friend_accepted' | 'instant_received' | 'instant_viewed' | 'message';
  entityId: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
