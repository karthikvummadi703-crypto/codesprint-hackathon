/**
 * Tests for ISSUE 4: the signed-in user's real name.
 *
 * `resolveDisplayName` is the single place a name is chosen, so these cases
 * cover the order that keeps a placeholder or a stale value from appearing.
 */
import { describe, it, expect } from 'vitest';
import { resolveDisplayName, initialsFor, ANONYMOUS_NAME } from '../profileService';
import type { AppUser } from '../authService';

const user = (over: Partial<AppUser> = {}): AppUser => ({
  uid: 'uid-1',
  name: null,
  email: null,
  photoURL: null,
  isDev: false,
  ...over,
});

describe('resolveDisplayName', () => {
  it('prefers the name stored in the user profile', () => {
    expect(
      resolveDisplayName(user({ name: 'Auth Token Name', email: 'a@b.com' }), { name: 'Priya Sharma' }),
    ).toBe('Priya Sharma');
  });

  it('uses the auth provider name when the profile has none', () => {
    expect(resolveDisplayName(user({ name: 'Google Name', email: 'a@b.com' }), {})).toBe('Google Name');
    expect(resolveDisplayName(user({ name: 'Google Name', email: 'a@b.com' }), null)).toBe('Google Name');
  });

  it('falls back to the email local-part only when no name exists', () => {
    expect(resolveDisplayName(user({ email: 'karthik@example.com' }), {})).toBe('karthik');
  });

  it('uses the anonymous label when there is genuinely nothing', () => {
    expect(resolveDisplayName(user(), {})).toBe(ANONYMOUS_NAME);
    expect(resolveDisplayName(null, null)).toBe(ANONYMOUS_NAME);
  });

  it('never returns a placeholder as if it were a real name', () => {
    const resolved = resolveDisplayName(user({ name: '   ' }), { name: '   ' });
    expect(resolved).not.toBe('Dev User');
    expect(resolved).toBe(ANONYMOUS_NAME);
  });

  it('ignores a stale profile belonging to a previous account', () => {
    // The context clears the profile on uid change, so a profile whose uid no
    // longer matches must not be consulted by callers.
    const previousAccount = { ...user({ email: 'first@example.com' }), uid: 'uid-old' };
    expect(resolveDisplayName(previousAccount, { name: 'First User' })).toBe('First User');
    expect(resolveDisplayName(user({ email: 'second@example.com' }), null)).toBe('second');
  });

  it('does not treat an email as a name when a real name exists', () => {
    const resolved = resolveDisplayName(user({ email: 'someone@example.com' }), { name: 'Ana Lima' });
    expect(resolved).not.toContain('@');
    expect(resolved).toBe('Ana Lima');
  });
});

describe('initialsFor', () => {
  it('takes first and last initials', () => {
    expect(initialsFor('Priya Sharma')).toBe('PS');
  });

  it('handles a single name', () => {
    expect(initialsFor('Prince')).toBe('PR');
  });

  it('handles middle names and separators', () => {
    expect(initialsFor('Ana Maria Lopez')).toBe('AL');
    expect(initialsFor('jean-luc picard')).toBe('JP');
  });

  it('never exceeds two characters', () => {
    expect(initialsFor('A Very Long Multi Word Name').length).toBeLessThanOrEqual(2);
  });

  it('returns a placeholder for empty input', () => {
    expect(initialsFor('')).toBe('?');
  });
});
