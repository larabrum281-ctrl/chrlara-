# FLASH Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity & PII Isolation**: Public `/users/{userId}` documents never contain email addresses or phone numbers. Private PII lives exclusively under `/users/{userId}/private/info` and is readable/writable only by `userId`.
2. **Friendship Gate**: An instant or direct message can only be created when an accepted `/friendships/{minUid_maxUid}` document exists linking `senderId` and `recipientId`.
3. **View-Once Terminal Locking**: Once an `/instants/{instantId}` document transitions from `unopened` to `viewing`, `viewed`, or `expired`, it can never be reverted to `unopened`. Only `recipientId` may open or mark an instant as `viewed`.
4. **Server Timestamps**: All `createdAt`, `receivedAt`, `viewedAt`, and `updatedAt` fields must match `request.time`.
5. **Query Enforcement**: Every `allow list` rule evaluates `resource.data` against `request.auth.uid` so unauthorized scraping queries are rejected by Firestore itself.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **PII Leak Read**: Non-owner attempts `GET /users/victimUid/private/info` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on Profile**: Owner attempts `CREATE /users/myUid` with extra `isAdmin: true` field -> `PERMISSION_DENIED`.
3. **Username Hijack**: Attacker attempts `CREATE /usernames/target` with `uid: "victimUid"` -> `PERMISSION_DENIED`.
4. **Unverified Email Write**: User with `email_verified: false` attempts `CREATE /instants/inst1` -> `PERMISSION_DENIED`.
5. **Non-Friend Instant Injection**: Sender without an accepted friendship attempts `CREATE /instants/inst2` -> `PERMISSION_DENIED`.
6. **Instant Replay Attack**: Recipient attempts `UPDATE /instants/inst1` setting `status: "unopened"` after it was already `viewed` -> `PERMISSION_DENIED`.
7. **Sender Self-View Bypass**: Sender attempts `UPDATE /instants/inst1` setting `status: "viewed"` -> `PERMISSION_DENIED`.
8. **Storage Path Poisoning**: Attacker attempts `CREATE /instants/inst3` with a 10KB `caption` or oversized `storagePath` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Sender creates `/messages/msg1` with `createdAt` in the past instead of `request.time` -> `PERMISSION_DENIED`.
10. **Friendship Force-Accept**: Requester attempts `UPDATE /friendships/u1_u2` setting `status: "accepted"` on their own outgoing request -> `PERMISSION_DENIED`.
11. **Oversized Document ID**: Attacker attempts `CREATE /instants/<200-char-id>` -> `PERMISSION_DENIED`.
12. **Blanket List Scraping**: User attempts `LIST /instants` without filtering by `participantIds array-contains myUid` -> `PERMISSION_DENIED`.
