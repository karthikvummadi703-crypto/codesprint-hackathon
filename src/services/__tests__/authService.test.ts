import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User as FirebaseUser } from 'firebase/auth';

import {
  DEV_UID,
  appLogin,
  appLoginWithGoogle,
  appLogout,
  appResetPassword,
  appSignUp,
  getAppToken,
  getCurrentAppUser,
  isGoogleSignInAvailable,
  onAppAuthStateChange,
} from '../authService';

const mocks = vi.hoisted(() => ({
  configured: { value: true },
  auth: { currentUser: null as null | { getIdToken: ReturnType<typeof vi.fn> } },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  updateProfile: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

vi.mock('../firebase', () => ({
  get isFirebaseConfigured() {
    return mocks.configured.value;
  },
  auth: mocks.auth,
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: mocks.signInWithPopup,
  GoogleAuthProvider: mocks.GoogleAuthProvider,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  signOut: mocks.signOut,
  onAuthStateChanged: mocks.onAuthStateChanged,
  updateProfile: mocks.updateProfile,
}));

interface LocalDevAccount {
  uid: string;
  email: string;
  name: string;
}

const DEV_ACCOUNTS_KEY = 'airguard_dev_accounts';
const DEV_AUTH_KEY = 'airguard_dev_auth';

function firebaseUser(overrides: Record<string, unknown> = {}): FirebaseUser {
  return {
    uid: 'fb-uid-1',
    email: 'fb@example.com',
    displayName: 'Firebase User',
    photoURL: 'https://example.test/avatar.png',
    getIdToken: vi.fn().mockResolvedValue('firebase-token'),
    ...overrides,
  } as unknown as FirebaseUser;
}

function seedDevAccount(overrides: Partial<LocalDevAccount> = {}): LocalDevAccount {
  const account: LocalDevAccount = {
    uid: 'dev-existing',
    email: 'existing@example.com',
    name: 'Existing User',
    ...overrides,
  };
  localStorage.setItem(DEV_ACCOUNTS_KEY, JSON.stringify({ [account.uid]: account }));
  return account;
}

function readStoredUser(): LocalDevAccount | null {
  const raw = localStorage.getItem(DEV_AUTH_KEY);
  return raw ? (JSON.parse(raw) as LocalDevAccount) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.configured.value = true;
  mocks.auth.currentUser = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('appSignUp', () => {
  it('creates a Firebase account and writes the supplied display name', async () => {
    const user = firebaseUser();
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user });
    mocks.updateProfile.mockResolvedValue(undefined);

    const result = await appSignUp('Asha Rao', 'asha@example.com', 'password123');

    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      'asha@example.com',
      'password123',
    );
    expect(mocks.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Asha Rao' });
    expect(result).toEqual({
      uid: 'fb-uid-1',
      email: 'fb@example.com',
      name: 'Firebase User',
      photoURL: 'https://example.test/avatar.png',
      isDev: false,
    });
    expect(localStorage.getItem(DEV_AUTH_KEY)).toBeNull();
  });

  it('does not call updateProfile when no name is supplied', async () => {
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: firebaseUser() });

    await appSignUp('', 'asha@example.com', 'password123');

    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('propagates a Firebase signup failure unchanged', async () => {
    mocks.createUserWithEmailAndPassword.mockRejectedValue(new Error('Email already in use.'));

    await expect(appSignUp('Asha', 'asha@example.com', 'password123')).rejects.toThrow(
      'Email already in use.',
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('creates a dev account, derives a name from the email, and notifies listeners', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mocks.configured.value = false;
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const pending = appSignUp('', 'New.User@Example.com', 'password123');
    await vi.advanceTimersByTimeAsync(600);

    const result = await pending;

    expect(result).toEqual({
      uid: `dev-${Date.now()}`,
      email: 'New.User@Example.com',
      name: 'New.User',
      photoURL: null,
      isDev: true,
    });
    expect(readStoredUser()).toEqual({
      uid: result.uid,
      email: 'New.User@Example.com',
      name: 'New.User',
    });
    expect(
      JSON.parse(localStorage.getItem(DEV_ACCOUNTS_KEY) ?? '{}') as Record<string, LocalDevAccount>,
    ).toHaveProperty(result.uid, {
      uid: result.uid,
      email: 'New.User@Example.com',
      name: 'New.User',
    });
    expect(dispatch).toHaveBeenCalledWith(new CustomEvent('dev-auth-change'));
    expect(mocks.createUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('refuses a duplicate dev email regardless of case and leaves the session untouched', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mocks.configured.value = false;
    seedDevAccount({ email: 'Existing@Example.com' });
    const pending = appSignUp('Another', 'existing@example.com', 'password123');
    const assertion = expect(pending).rejects.toThrow('An account with this email already exists.');
    await vi.advanceTimersByTimeAsync(600);

    await assertion;
    expect(localStorage.getItem(DEV_AUTH_KEY)).toBeNull();
  });
});

describe('appLogin', () => {
  it('signs in through Firebase and maps the returned user', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: firebaseUser() });

    const result = await appLogin('fb@example.com', 'password123');

    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      'fb@example.com',
      'password123',
    );
    expect(result).toMatchObject({ uid: 'fb-uid-1', isDev: false });
  });

  it('propagates a Firebase sign-in failure', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValue(new Error('Wrong password.'));

    await expect(appLogin('fb@example.com', 'bad')).rejects.toThrow('Wrong password.');
  });

  it('logs into an existing dev account with a case-insensitive email', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mocks.configured.value = false;
    const account = seedDevAccount();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const pending = appLogin('EXISTING@example.com', 'password123');
    await vi.advanceTimersByTimeAsync(600);

    const result = await pending;

    expect(result).toEqual({ ...account, photoURL: null, isDev: true });
    expect(readStoredUser()).toEqual(account);
    expect(dispatch).toHaveBeenCalledWith(new CustomEvent('dev-auth-change'));
  });

  it('reports a missing dev account and a too-short dev password differently', async () => {
    vi.useFakeTimers();
    mocks.configured.value = false;
    const missing = appLogin('nobody@example.com', 'password123');
    const missingAssertion = expect(missing).rejects.toThrow(
      'No account found with this email. Please sign up first.',
    );
    await vi.advanceTimersByTimeAsync(600);
    await missingAssertion;

    seedDevAccount();
    const short = appLogin('existing@example.com', 'short');
    const shortAssertion = expect(short).rejects.toThrow('Invalid email or password.');
    await vi.advanceTimersByTimeAsync(600);
    await shortAssertion;
    expect(localStorage.getItem(DEV_AUTH_KEY)).toBeNull();
  });
});

describe('Google sign-in', () => {
  it('uses a popup provider and reports availability when Firebase is configured', async () => {
    mocks.signInWithPopup.mockResolvedValue({ user: firebaseUser({ displayName: 'Google User' }) });

    const result = await appLoginWithGoogle();

    expect(mocks.GoogleAuthProvider).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithPopup).toHaveBeenCalledWith(
      mocks.auth,
      mocks.GoogleAuthProvider.mock.instances[0],
    );
    expect(result).toMatchObject({ name: 'Google User', isDev: false });
    expect(isGoogleSignInAvailable()).toBe(true);
  });

  it('fails loudly and stores nothing when Firebase is not configured', async () => {
    mocks.configured.value = false;

    await expect(appLoginWithGoogle()).rejects.toThrow(
      'Google sign-in needs a Firebase configuration.',
    );
    expect(isGoogleSignInAvailable()).toBe(false);
    expect(mocks.signInWithPopup).not.toHaveBeenCalled();
    expect(localStorage.getItem(DEV_ACCOUNTS_KEY)).toBeNull();
  });
});

describe('password reset and logout', () => {
  it('delegates password reset and sign-out to Firebase', async () => {
    mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);

    await appResetPassword('fb@example.com');
    await appLogout();

    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(mocks.auth, 'fb@example.com');
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });

  it('resolves without network in dev mode and clears the dev session on logout', async () => {
    vi.useFakeTimers();
    mocks.configured.value = false;
    seedDevAccount();
    localStorage.setItem(DEV_AUTH_KEY, JSON.stringify(seedDevAccount()));
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    dispatch.mockClear();

    const reset = appResetPassword('existing@example.com');
    await vi.advanceTimersByTimeAsync(600);
    await expect(reset).resolves.toBeUndefined();

    await appLogout();

    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(DEV_AUTH_KEY)).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(new CustomEvent('dev-auth-change'));
  });
});

describe('session helpers', () => {
  it('reads the Firebase id token for the current user', async () => {
    const user = firebaseUser();
    mocks.auth.currentUser = user as unknown as { getIdToken: ReturnType<typeof vi.fn> };

    await expect(getAppToken()).resolves.toBe('firebase-token');
    expect(user.getIdToken).toHaveBeenCalledTimes(1);
    expect(getCurrentAppUser()).toBeNull();
  });

  it('returns no token when Firebase has no current user', async () => {
    await expect(getAppToken()).resolves.toBeNull();
  });

  it('returns a dev token and dev user only in dev mode', async () => {
    mocks.configured.value = false;
    await expect(getAppToken()).resolves.toBeNull();

    const account = seedDevAccount();
    localStorage.setItem(DEV_AUTH_KEY, JSON.stringify(account));

    await expect(getAppToken()).resolves.toBe(`dev:${account.uid}`);
    expect(getCurrentAppUser()).toEqual({
      ...account,
      photoURL: null,
      isDev: true,
    });
  });

  it('ignores corrupt dev session data', async () => {
    mocks.configured.value = false;
    localStorage.setItem(DEV_AUTH_KEY, '{not json');

    expect(getCurrentAppUser()).toBeNull();
    await expect(getAppToken()).resolves.toBeNull();
  });

  it('forwards Firebase auth changes through the public callback and unsubscribes', () => {
    const unsubscribe = vi.fn();
    const user = firebaseUser({ displayName: null, photoURL: null });
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (value: FirebaseUser | null) => void) => {
        callback(user);
        return unsubscribe;
      },
    );
    const callback = vi.fn();

    const stop = onAppAuthStateChange(callback);

    expect(mocks.onAuthStateChanged).toHaveBeenCalledWith(mocks.auth, expect.any(Function));
    expect(callback).toHaveBeenCalledWith({
      uid: 'fb-uid-1',
      email: 'fb@example.com',
      name: null,
      photoURL: null,
      isDev: false,
    });
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reports a signed-out Firebase user as null', () => {
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (value: FirebaseUser | null) => void) => {
        callback(null);
        return vi.fn();
      },
    );
    const callback = vi.fn();

    onAppAuthStateChange(callback);

    expect(callback).toHaveBeenCalledWith(null);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(DEV_UID).toBe('dev-user');
  });

  it('fires immediately on dev auth changes and stops after unsubscribing', () => {
    mocks.configured.value = false;
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const callback = vi.fn();

    const stop = onAppAuthStateChange(callback);

    expect(callback).toHaveBeenCalledWith(null);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('dev-auth-change', expect.any(Function));

    const handler = addEventListener.mock.calls.find(([name]) => name === 'dev-auth-change')?.[1];
    const account = seedDevAccount();
    localStorage.setItem(DEV_AUTH_KEY, JSON.stringify(account));
    expect(handler).toBeDefined();
    window.dispatchEvent(new CustomEvent('dev-auth-change'));
    expect(callback).toHaveBeenLastCalledWith({ ...account, photoURL: null, isDev: true });

    stop();
    expect(removeEventListener).toHaveBeenCalledWith('dev-auth-change', handler);
    callback.mockClear();
    window.dispatchEvent(new CustomEvent('dev-auth-change'));
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns null for corrupt dev session data when subscribing', () => {
    mocks.configured.value = false;
    localStorage.setItem(DEV_AUTH_KEY, '{not json');
    const callback = vi.fn();

    onAppAuthStateChange(callback);

    expect(callback).toHaveBeenCalledWith(null);
  });
});
