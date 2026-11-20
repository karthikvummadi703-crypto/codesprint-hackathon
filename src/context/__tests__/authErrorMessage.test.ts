import { describe, expect, it } from 'vitest';

import { firebaseErrorMessage } from '../AuthContext';

describe('firebaseErrorMessage', () => {
  it.each([
    ['auth/invalid-credential', 'Invalid email or password.'],
    ['auth/wrong-password', 'Invalid email or password.'],
    ['auth/user-not-found', 'Invalid email or password.'],
    ['auth/email-already-in-use', 'An account with this email already exists.'],
    ['auth/weak-password', 'Password should be at least 6 characters.'],
    ['auth/too-many-requests', 'Too many attempts. Please try again later.'],
    ['auth/network-request-failed', 'Network error. Check your connection.'],
    ['auth/popup-closed-by-user', 'Google sign-in was cancelled.'],
    ['auth/cancelled-popup-request', 'Google sign-in was cancelled.'],
    ['auth/popup-blocked', 'Your browser blocked the Google sign-in popup.'],
    ['auth/unauthorized-domain', 'This domain is not authorized'],
    ['auth/account-exists-with-different-credential', 'An account already exists'],
    ['auth/operation-not-allowed', 'Google sign-in is not enabled'],
  ])('maps %s to a readable message', (code, expected) => {
    expect(firebaseErrorMessage({ code })).toContain(expected);
  });

  it('cleans the generic Firebase prefix and suffix', () => {
    expect(firebaseErrorMessage({ message: 'Firebase: Something failed (auth/foo).' })).toBe(
      'Something failed',
    );
  });

  it('uses a safe fallback for a missing error', () => {
    expect(firebaseErrorMessage(null)).toBe('Something went wrong. Please try again.');
  });

  it('keeps the raw Firebase code for diagnosis', () => {
    expect(
      firebaseErrorMessage({ code: 'auth/internal-error', message: 'Firebase: Internal error.' }),
    ).toContain('[auth/internal-error]');
  });
});
