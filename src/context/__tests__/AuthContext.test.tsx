import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, firebaseErrorMessage, loadProfile, useAuth } from '../AuthContext';
import type { AppUser } from '../../services/authService';
import type { UserProfile } from '../../services/profileService';

type AuthCallback = (user: AppUser | null) => Promise<void>;

const mocks = vi.hoisted(() => ({
  authCallback: null as AuthCallback | null,
  unsubscribe: vi.fn(),
  onAppAuthStateChange: vi.fn(),
  appSignUp: vi.fn(),
  appLogin: vi.fn(),
  appLoginWithGoogle: vi.fn(),
  appResetPassword: vi.fn(),
  appLogout: vi.fn(),
  clearResponseCache: vi.fn(),
  getUser: vi.fn(),
  saveUser: vi.fn(),
  ensureProfile: vi.fn(),
  saveProfileName: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  onAppAuthStateChange: (callback: AuthCallback) => {
    mocks.authCallback = callback;
    return mocks.unsubscribe;
  },
  appSignUp: mocks.appSignUp,
  appLogin: mocks.appLogin,
  appLoginWithGoogle: mocks.appLoginWithGoogle,
  appResetPassword: mocks.appResetPassword,
  appLogout: mocks.appLogout,
}));

vi.mock('../../services/apiClient', () => ({ clearResponseCache: mocks.clearResponseCache }));
vi.mock('../../services/dataService', () => ({ getUser: mocks.getUser, saveUser: mocks.saveUser }));
vi.mock('../../services/profileService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/profileService')>();
  return { ...actual, ensureProfile: mocks.ensureProfile, saveProfileName: mocks.saveProfileName };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    uid: 'u1',
    email: 'user@example.com',
    name: 'Auth Name',
    photoURL: 'https://example.test/provider.png',
    isDev: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Profile Name',
    email: 'user@example.com',
    photoURL: 'data:image/png;base64,PROFILE',
    location: 'Delhi',
    ...overrides,
  };
}

function AuthProbe() {
  const auth = useAuth();
  const [error, setError] = useState('');

  const run = (action: () => Promise<void>) => {
    void action().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  return (
    <div>
      <output data-testid="initializing">{String(auth.initializing)}</output>
      <output data-testid="uid">{auth.user?.uid ?? 'none'}</output>
      <output data-testid="displayName">{auth.displayName}</output>
      <output data-testid="avatarUrl">{auth.avatarUrl ?? 'none'}</output>
      <output data-testid="profileName">{auth.profile?.name ?? 'none'}</output>
      <output data-testid="profileLoading">{String(auth.profileLoading)}</output>
      <output data-testid="actionError">{error}</output>
      <button
        type="button"
        onClick={() => run(() => auth.signup('New Name', 'new@example.com', 'password1'))}
      >
        signup
      </button>
      <button type="button" onClick={() => run(() => auth.login('user@example.com', 'password1'))}>
        login
      </button>
      <button type="button" onClick={() => run(() => auth.loginWithGoogle())}>
        google
      </button>
      <button type="button" onClick={() => run(() => auth.resetPassword('user@example.com'))}>
        reset
      </button>
      <button type="button" onClick={() => run(() => auth.logout())}>
        logout
      </button>
      <button type="button" onClick={() => run(() => auth.updateName('  New Display  '))}>
        updateName
      </button>
      <button type="button" onClick={() => run(() => auth.updateName('   '))}>
        updateNameEmpty
      </button>
      <button type="button" onClick={() => run(() => auth.updateAvatar(null))}>
        clearAvatar
      </button>
      <button
        type="button"
        onClick={() => run(() => auth.updateAvatar('data:image/png;base64,NEW'))}
      >
        setAvatar
      </button>
      <button type="button" onClick={() => auth.syncProfileLocally({ name: 'Local Name' })}>
        sync
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

async function emitAuth(user: AppUser | null) {
  await act(async () => {
    await mocks.authCallback?.(user);
  });
}

async function expectNoViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

function value(testId: string) {
  return screen.getByTestId(testId).textContent;
}

describe('AuthContext', () => {
  beforeEach(() => {
    mocks.authCallback = null;
    mocks.unsubscribe.mockReset().mockImplementation(() => undefined);
    mocks.appSignUp.mockReset().mockResolvedValue(makeUser());
    mocks.appLogin.mockReset().mockResolvedValue(makeUser());
    mocks.appLoginWithGoogle.mockReset().mockResolvedValue(makeUser());
    mocks.appResetPassword.mockReset().mockResolvedValue(undefined);
    mocks.appLogout.mockReset().mockResolvedValue(undefined);
    mocks.clearResponseCache.mockReset().mockImplementation(() => undefined);
    mocks.getUser.mockReset().mockResolvedValue(null);
    mocks.saveUser.mockReset().mockResolvedValue(undefined);
    mocks.ensureProfile.mockReset().mockResolvedValue(makeProfile());
    mocks.saveProfileName.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a descriptive error when useAuth is called outside AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<AuthProbe />)).toThrow('useAuth must be used within AuthProvider');
  });

  it('starts initializing and becomes signed out after the null auth callback, without axe violations', async () => {
    const { container, unmount } = renderProvider();
    expect(value('initializing')).toBe('true');
    expect(value('uid')).toBe('none');
    expect(value('displayName')).toBe('AirGuard User');

    await emitAuth(null);

    expect(value('initializing')).toBe('false');
    expect(value('profileLoading')).toBe('false');
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
    await expectNoViolations(container);

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('loads a signed-in profile, resolves the name and avatar, and has no axe violations', async () => {
    const pending = deferred<UserProfile | null>();
    mocks.ensureProfile.mockReturnValue(pending.promise);
    const user = makeUser();
    const { container } = renderProvider();

    await act(async () => {
      void mocks.authCallback?.(user);
    });

    expect(value('uid')).toBe('u1');
    expect(value('initializing')).toBe('false');
    expect(value('profileLoading')).toBe('true');
    expect(mocks.ensureProfile).toHaveBeenCalledWith(user);

    await act(async () => {
      pending.resolve(makeProfile());
      await pending.promise;
    });

    expect(value('profileLoading')).toBe('false');
    expect(value('profileName')).toBe('Profile Name');
    expect(value('displayName')).toBe('Profile Name');
    expect(value('avatarUrl')).toBe('data:image/png;base64,PROFILE');
    await expectNoViolations(container);
  });

  it('falls back to the auth name and email local part when the profile has none', async () => {
    mocks.ensureProfile.mockResolvedValue(makeProfile({ name: '', photoURL: null }));
    const { container } = renderProvider();

    await emitAuth(makeUser({ name: 'Provider Name', photoURL: 'https://example.test/p.png' }));
    expect(value('displayName')).toBe('Provider Name');
    expect(value('avatarUrl')).toBe('https://example.test/p.png');

    await emitAuth(makeUser({ name: null, photoURL: 'https://example.test/p.png' }));
    expect(value('displayName')).toBe('user');
    expect(value('avatarUrl')).toBe('https://example.test/p.png');
    await expectNoViolations(container);
  });

  it('ignores a stale profile read from a previous account', async () => {
    const stale = deferred<UserProfile | null>();
    mocks.ensureProfile
      .mockResolvedValueOnce(stale.promise)
      .mockResolvedValueOnce(makeProfile({ name: 'Second User' }));
    const { container } = renderProvider();

    await act(async () => {
      void mocks.authCallback?.(makeUser({ uid: 'first', email: 'first@example.com' }));
    });
    await emitAuth(makeUser({ uid: 'second', email: 'second@example.com' }));
    expect(value('displayName')).toBe('Second User');

    await act(async () => {
      stale.resolve(makeProfile({ name: 'First User' }));
      await stale.promise;
    });

    expect(value('uid')).toBe('second');
    expect(value('displayName')).toBe('Second User');
    await expectNoViolations(container);
  });

  it('clears user and profile data after a 401 auth-error event', async () => {
    const { container } = renderProvider();
    await emitAuth(makeUser());

    await act(async () => {
      window.dispatchEvent(new Event('auth-error'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.appLogout).toHaveBeenCalledTimes(1));
    expect(mocks.clearResponseCache).toHaveBeenCalledTimes(1);
    expect(value('uid')).toBe('none');
    expect(value('profileName')).toBe('none');
    expect(value('displayName')).toBe('AirGuard User');
    await expectNoViolations(container);
  });

  it('signs up and creates a profile through the service layer', async () => {
    const user = makeUser({ uid: 'new-user', email: 'new@example.com', name: 'New Name' });
    mocks.appSignUp.mockResolvedValue(user);
    const { container } = renderProvider();
    await emitAuth(null);

    await userEvent.setup().click(screen.getByRole('button', { name: 'signup' }));

    expect(mocks.appSignUp).toHaveBeenCalledWith('New Name', 'new@example.com', 'password1');
    expect(mocks.ensureProfile).toHaveBeenCalledWith(user);
    await expectNoViolations(container);
  });

  it('logs in with email and password and creates a profile', async () => {
    const user = makeUser({ uid: 'login-user' });
    mocks.appLogin.mockResolvedValue(user);
    const { container } = renderProvider();
    await emitAuth(null);

    await userEvent.setup().click(screen.getByRole('button', { name: 'login' }));

    expect(mocks.appLogin).toHaveBeenCalledWith('user@example.com', 'password1');
    expect(mocks.ensureProfile).toHaveBeenCalledWith(user);
    await expectNoViolations(container);
  });

  it('logs in with Google and creates a profile', async () => {
    const user = makeUser({ uid: 'google-user' });
    mocks.appLoginWithGoogle.mockResolvedValue(user);
    const { container } = renderProvider();
    await emitAuth(null);

    await userEvent.setup().click(screen.getByRole('button', { name: 'google' }));

    expect(mocks.appLoginWithGoogle).toHaveBeenCalledTimes(1);
    expect(mocks.ensureProfile).toHaveBeenCalledWith(user);
    await expectNoViolations(container);
  });

  it('sends a password reset request without touching the profile', async () => {
    const { container } = renderProvider();
    await emitAuth(null);

    await userEvent.setup().click(screen.getByRole('button', { name: 'reset' }));

    expect(mocks.appResetPassword).toHaveBeenCalledWith('user@example.com');
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
    await expectNoViolations(container);
  });

  it('logs out, clears the response cache and drops the profile', async () => {
    const { container } = renderProvider();
    await emitAuth(makeUser());

    await userEvent.setup().click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(mocks.appLogout).toHaveBeenCalledTimes(1));
    expect(mocks.clearResponseCache).toHaveBeenCalledTimes(1);
    expect(value('profileName')).toBe('none');
    await expectNoViolations(container);
  });

  it('trims and persists a name change, then refreshes the resolved display name', async () => {
    const { container } = renderProvider();
    await emitAuth(makeUser());

    await userEvent.setup().click(screen.getByRole('button', { name: 'updateName' }));

    await waitFor(() => expect(mocks.saveProfileName).toHaveBeenCalledWith('u1', 'New Display'));
    expect(value('profileName')).toBe('New Display');
    expect(value('displayName')).toBe('New Display');
    expect(value('actionError')).toBe('');
    await expectNoViolations(container);
  });

  it('rejects empty names and profile edits while signed out', async () => {
    const { container } = renderProvider();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'updateName' }));
    expect(value('actionError')).toBe('Not signed in.');

    await emitAuth(makeUser());
    await user.click(screen.getByRole('button', { name: 'updateNameEmpty' }));
    expect(value('actionError')).toBe('Name cannot be empty.');
    expect(mocks.saveProfileName).not.toHaveBeenCalled();
    await expectNoViolations(container);
  });

  it('persists a null avatar and a new data URL, falling back to the provider photo on null', async () => {
    const { container } = renderProvider();
    await emitAuth(makeUser());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'clearAvatar' }));

    await waitFor(() => expect(mocks.saveUser).toHaveBeenCalledWith('u1', { photoURL: null }));
    expect(value('avatarUrl')).toBe('https://example.test/provider.png');

    await user.click(screen.getByRole('button', { name: 'setAvatar' }));
    await waitFor(() =>
      expect(mocks.saveUser).toHaveBeenCalledWith('u1', { photoURL: 'data:image/png;base64,NEW' }),
    );
    expect(value('avatarUrl')).toBe('data:image/png;base64,NEW');
    await expectNoViolations(container);
  });

  it('applies a local profile patch without persisting it', async () => {
    const { container } = renderProvider();
    await emitAuth(makeUser());

    await userEvent.setup().click(screen.getByRole('button', { name: 'sync' }));

    expect(value('profileName')).toBe('Local Name');
    expect(value('displayName')).toBe('Local Name');
    expect(mocks.saveUser).not.toHaveBeenCalled();
    expect(mocks.saveProfileName).not.toHaveBeenCalled();
    await expectNoViolations(container);
  });

  it('re-exports loadProfile so it reads user data by uid', async () => {
    const profile = { name: 'Stored' };
    mocks.getUser.mockResolvedValue(profile);

    await expect(loadProfile('u1')).resolves.toEqual(profile);
    expect(mocks.getUser).toHaveBeenCalledWith('u1');
  });

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
    [
      'auth/popup-blocked',
      'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.',
    ],
    [
      'auth/unauthorized-domain',
      'This domain is not authorized for Google sign-in. Add localhost (or 127.0.0.1) under Firebase Authentication > Settings > Authorized domains.',
    ],
    [
      'auth/account-exists-with-different-credential',
      'An account already exists with this email using a different sign-in method.',
    ],
    [
      'auth/operation-not-allowed',
      'Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication.',
    ],
  ])('maps %s to a readable message', (code, message) => {
    expect(firebaseErrorMessage({ code, message: `Firebase: Error (${code}).` })).toBe(message);
  });

  it('strips Firebase prefix and auth suffix from unknown errors', () => {
    expect(
      firebaseErrorMessage({ message: 'Firebase: Something failed (auth/internal-error).' }),
    ).toBe('Something failed');
    expect(firebaseErrorMessage(null)).toBe('Something went wrong. Please try again.');
    expect(firebaseErrorMessage('plain failure')).toBe('plain failure');
  });
});
