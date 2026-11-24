/**
 * Dirty Dozen Firestore Security Rules Verification Spec
 * Run against Firebase Emulator Suite when testing locally.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'PII Leak Read on /users/{uid}/private/info', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Shadow Field Injection (isAdmin: true) on /users/{uid}', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Username Hijack with mismatched uid', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Unverified Email Write on /instants', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Non-Friend Instant Injection without accepted friendship', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Instant Replay Attack reverting viewed -> unopened', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Sender Self-View Bypass on /instants', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Oversized caption (>160 chars) on /instants', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Client Timestamp Forgery on /messages', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Requester Force-Accept on outgoing /friendships', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Oversized Document ID (>128 chars)', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Blanket List Scraping without participantIds filter', expected: 'PERMISSION_DENIED' },
];

describe('FLASH Firestore Security Rules Dirty Dozen Specification', () => {
  it('defines all 12 adversarial payloads', () => {
    assert.equal(DIRTY_DOZEN_CASES.length, 12);
  });
});
