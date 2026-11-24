import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthProvider } from 'firebase/auth';

type FakeUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
};
type AuthResult = { user: FakeUser };
type AuthCallback = (user: FakeUser | null) => void;

const authState = vi.hoisted(() => ({
  configured: true,
  auth: { currentUser: null as FakeUser | null },
}));

const authMocks = vi.hoisted(() => {
  class GoogleAuthProvider {}
  return {
    GoogleAuthProvider,
    createUserWithEmailAndPassword:
      vi.fn<(auth: unknown, email: string, password: string) => Promise<AuthResult>>(),
    signInWithEmailAndPassword:
      vi.fn<(auth: unknown, email: string, password: string) => Promise<AuthResult>>(),
    signInWithPopup: vi.fn<(auth: unknown, provider: unknown) => Promise<AuthResult>>(),
    signInWithRedirect: vi.fn<(auth: unknown, provider: unknown) => Promise<void>>(),
    getRedirectResult: vi.fn<(auth: unknown) => Promise<AuthResult | null>>(),
    sendPasswordResetEmail: vi.fn<(auth: unknown, email: string) => Promise<void>>(),
    signOut: vi.fn<(auth: unknown) => Promise<void>>(),
    onAuthStateChanged: vi.fn<(auth: unknown, cb: AuthCallback) => () => void>(),
    updateProfile: vi.fn<(user: unknown, profile: { displayName?: string }) => Promise<void>>(),
  };
});

vi.mock('firebase/auth', () => authMocks);
vi.mock('../firebase', () => ({
  get isFirebaseConfigured() {
    return authState.configured;
  },
  get auth() {
    return authState.auth;
  },
}));

import type { AppUser } from '../authService';
import {
  DEV_UID,
  appCompleteGoogleRedirect,
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

const FIXED_NOW = 1_700_000_000_000;
const unsubscribeAuth = vi.fn<() => void>();
let authCallback: AuthCallback = () => undefined;

function fakeUser(over: Partial<FakeUser> = {}): FakeUser {
  return {
    uid: 'firebase-uid',
    email: 'person@example.com',
    displayName: 'Provider Name',
    photoURL: 'https://example.com/photo.png',
    getIdToken: async () => 'firebase-token',
    ...over,
  };
}

async function advanceDevDelay<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.advanceTimersByTimeAsync(600);
  const result = await settled;
  if (!result.ok) throw result.error;
  return result.value;
}

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear();
    authState.configured = true;
    authState.auth.currentUser = null;
    authCallback = () => undefined;
    vi.resetAllMocks();

    authMocks.createUserWithEmailAndPassword.mockResolvedValue({ user: fakeUser() });
    authMocks.signInWithEmailAndPassword.mockResolvedValue({ user: fakeUser() });
    authMocks.signInWithPopup.mockResolvedValue({ user: fakeUser() });
    authMocks.signInWithRedirect.mockResolvedValue(undefined);
    authMocks.getRedirectResult.mockResolvedValue(null);
    authMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    authMocks.signOut.mockResolvedValue(undefined);
    authMocks.updateProfile.mockResolvedValue(undefined);
    authMocks.onAuthStateChanged.mockImplementation((_auth, cb) => {
      authCallback = cb;
      return unsubscribeAuth;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('Firebase-backed authentication', () => {
    it('maps a created Firebase account and writes the display name', async () => {
      const user = fakeUser({ displayName: '', email: 'priya@example.com' });
      authMocks.createUserWithEmailAndPassword.mockResolvedValueOnce({ user });
      authMocks.updateProfile.mockImplementation(async (_target, profile) => {
        user.displayName = profile.displayName ?? null;
      });

      await expect(appSignUp('Priya Sharma', 'priya@example.com', 'password1')).resolves.toEqual({
        uid: 'firebase-uid',
        email: 'priya@example.com',
        name: 'Priya Sharma',
        photoURL: 'https://example.com/photo.png',
        isDev: false,
      });
      expect(authMocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        authState.auth,
        'priya@example.com',
        'password1',
      );
      expect(authMocks.updateProfile).toHaveBeenCalledWith(user, { displayName: 'Priya Sharma' });
      expect(localStorage.getItem('airguard_dev_auth')).toBeNull();
    });

    it('skips the profile update when no name was supplied', async () => {
      await appSignUp('', 'person@example.com', 'password1');

      expect(authMocks.updateProfile).not.toHaveBeenCalled();
    });

    it('propagates sign-up failures from Firebase', async () => {
      authMocks.createUserWithEmailAndPassword.mockRejectedValueOnce(new Error('email in use'));

      await expect(appSignUp('Name', 'used@example.com', 'password1')).rejects.toThrow('email in use');
      expect(authMocks.updateProfile).not.toHaveBeenCalled();
    });

    it('propagates a failed display-name update', async () => {
      authMocks.updateProfile.mockRejectedValueOnce(new Error('profile update failed'));

      await expect(appSignUp('Name', 'new@example.com', 'password1')).rejects.toThrow(
        'profile update failed',
      );
    });

    it('maps a signed-in Firebase user and propagates login errors', async () => {
      await expect(appLogin('person@example.com', 'password1')).resolves.toEqual({
        uid: 'firebase-uid',
        email: 'person@example.com',
        name: 'Provider Name',
        photoURL: 'https://example.com/photo.png',
        isDev: false,
      });

      authMocks.signInWithEmailAndPassword.mockRejectedValueOnce(new Error('wrong password'));
      await expect(appLogin('person@example.com', 'wrong')).rejects.toThrow('wrong password');
    });

    it('uses a Google popup and maps its user', async () => {
      const user = fakeUser({ uid: 'google-uid', displayName: 'Google Name', photoURL: null });
      authMocks.signInWithPopup.mockResolvedValueOnce({ user });

      await expect(appLoginWithGoogle()).resolves.toEqual({
        uid: 'google-uid',
        email: 'person@example.com',
        name: 'Google Name',
        photoURL: null,
        isDev: false,
      });
      expect(authMocks.signInWithPopup).toHaveBeenCalledWith(authState.auth, expect.any(GoogleAuthProvider));
      expect(authMocks.signInWithRedirect).not.toHaveBeenCalled();
    });

    it('falls back to redirect when the Google popup is blocked', async () => {
      authMocks.signInWithPopup.mockRejectedValueOnce({ code: 'auth/popup-blocked' });

      await expect(appLoginWithGoogle()).resolves.toBeNull();
      expect(authMocks.signInWithRedirect).toHaveBeenCalledWith(authState.auth, expect.anything());
    });

    it('rethrows other Google popup errors', async () => {
      authMocks.signInWithPopup.mockRejectedValueOnce(new Error('popup failed'));

      await expect(appLoginWithGoogle()).rejects.toThrow('popup failed');
      expect(authMocks.signInWithRedirect).not.toHaveBeenCalled();
    });

    it('reads the Google redirect result when present', async () => {
      const user = fakeUser({ uid: 'redirect-uid', displayName: null, email: null, photoURL: null });
      authMocks.getRedirectResult.mockResolvedValueOnce({ user });

      await expect(appCompleteGoogleRedirect()).resolves.toEqual({
        uid: 'redirect-uid',
        email: null,
        name: null,
        photoURL: null,
        isDev: false,
      });

      await expect(appCompleteGoogleRedirect()).resolves.toBeNull();
    });

    it('reports Google availability from the Firebase configuration', async () => {
      expect(isGoogleSignInAvailable()).toBe(true);
      authState.configured = false;
      expect(isGoogleSignInAvailable()).toBe(false);
      await expect(appLoginWithGoogle()).rejects.toThrow('Google sign-in needs a Firebase configuration.');
      await expect(appCompleteGoogleRedirect()).resolves.toBeNull();
    });

    it('sends password resets and signs out through Firebase', async () => {
      await appResetPassword('person@example.com');
      expect(authMocks.sendPasswordResetEmail).toHaveBeenCalledWith(authState.auth, 'person@example.com');

      await appLogout();
      expect(authMocks.signOut).toHaveBeenCalledWith(authState.auth);
    });

    it('uses the Firebase id token or returns null when signed out', async () => {
      await expect(getAppToken()).resolves.toBeNull();

      const getIdToken = vi.fn<() => Promise<string>>().mockResolvedValue('fresh-token');
      authState.auth.currentUser = fakeUser({ getIdToken });
      await expect(getAppToken()).resolves.toBe('fresh-token');
      expect(getIdToken).toHaveBeenCalledOnce();
    });

    it('maps Firebase auth state changes and returns the unsubscribe function', () => {
      const seen: Array<AppUser | null> = [];
      expect(onAppAuthStateChange((user) => seen.push(user))).toBe(unsubscribeAuth);

      expect(authMocks.onAuthStateChanged).toHaveBeenCalledWith(authState.auth, expect.any(Function));
      authCallback(fakeUser({ uid: 'observed-uid' }));
      authCallback(null);

      expect(seen.map((user) => user?.uid ?? null)).toEqual(['observed-uid', null]);
      expect(seen[0]).toEqual({
        uid: 'observed-uid',
        email: 'person@example.com',
        name: 'Provider Name',
        photoURL: 'https://example.com/photo.png',
        isDev: false,
      });
    });

    it('does not expose a stale dev account while Firebase is configured', async () => {
      localStorage.setItem(
        'airguard_dev_auth',
        JSON.stringify({ uid: 'dev-old', email: 'dev@example.com', name: 'Dev User' }),
      );

      expect(getCurrentAppUser()).toBeNull();
      await expect(getAppToken()).resolves.toBeNull();
    });
  });

  describe('development fallback authentication', () => {
    beforeEach(() => {
      authState.configured = false;
      vi.useFakeTimers();
    });

    it('creates a local account, persists it and notifies listeners', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      const dispatch = vi.spyOn(window, 'dispatchEvent');
      const account = { uid: `dev-${FIXED_NOW}`, email: 'me@example.com', name: 'Me' };

      await expect(advanceDevDelay(appSignUp('Me', 'me@example.com', 'password1'))).resolves.toEqual({
        ...account,
        photoURL: null,
        isDev: true,
      });
      expect(JSON.parse(localStorage.getItem('airguard_dev_accounts') ?? '{}')).toEqual({
        [account.uid]: account,
      });
      expect(JSON.parse(localStorage.getItem('airguard_dev_auth') ?? 'null')).toEqual(account);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'dev-auth-change' }));
      expect(DEV_UID).toBe('dev-user');
    });

    it('uses the email local part as the default dev name', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);

      const created = await advanceDevDelay(appSignUp('', 'newperson@example.com', 'password1'));
      expect(created.name).toBe('newperson');
      expect(created.uid).toBe(`dev-${FIXED_NOW}`);
    });

    it('rejects a duplicate dev email regardless of case', async () => {
      localStorage.setItem(
        'airguard_dev_accounts',
        JSON.stringify({ existing: { uid: 'existing', email: 'Taken@Example.com', name: 'Taken' } }),
      );

      await expect(advanceDevDelay(appSignUp('Other', 'taken@example.com', 'password1'))).rejects.toThrow(
        'An account with this email already exists.',
      );
      expect(localStorage.getItem('airguard_dev_auth')).toBeNull();
    });

    it('starts from an empty account list when stored accounts are corrupt', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      localStorage.setItem('airguard_dev_accounts', 'not json');

      const created = await advanceDevDelay(appSignUp('Fresh', 'fresh@example.com', 'password1'));
      expect(created.uid).toBe(`dev-${FIXED_NOW}`);
      expect(JSON.parse(localStorage.getItem('airguard_dev_accounts') ?? '{}')).toEqual({
        [created.uid]: { uid: created.uid, email: 'fresh@example.com', name: 'Fresh' },
      });
    });

    it('logs in a known dev account and rejects invalid credentials', async () => {
      localStorage.setItem(
        'airguard_dev_accounts',
        JSON.stringify({ a: { uid: 'dev-a', email: 'A@Example.com', name: 'Account A' } }),
      );

      await expect(advanceDevDelay(appLogin('a@example.com', 'password1'))).resolves.toEqual({
        uid: 'dev-a',
        email: 'A@Example.com',
        name: 'Account A',
        photoURL: null,
        isDev: true,
      });

      await expect(advanceDevDelay(appLogin('missing@example.com', 'password1'))).rejects.toThrow(
        'No account found with this email. Please sign up first.',
      );
      await expect(advanceDevDelay(appLogin('a@example.com', 'short'))).rejects.toThrow(
        'Invalid email or password.',
      );
      expect(authMocks.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('resolves a delayed dev password reset without changing state', async () => {
      await expect(advanceDevDelay(appResetPassword('me@example.com'))).resolves.toBeUndefined();
      expect(authMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('clears the dev session on logout and fires a change event', async () => {
      const dispatch = vi.spyOn(window, 'dispatchEvent');
      localStorage.setItem(
        'airguard_dev_auth',
        JSON.stringify({ uid: 'dev-a', email: 'a@example.com', name: 'Account A' }),
      );

      await appLogout();

      expect(localStorage.getItem('airguard_dev_auth')).toBeNull();
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'dev-auth-change' }));
      expect(authMocks.signOut).not.toHaveBeenCalled();
    });

    it('notifies dev auth listeners immediately and on later changes', () => {
      const seen: Array<ReturnType<typeof getCurrentAppUser>> = [];
      const stop = onAppAuthStateChange((user) => seen.push(user));
      expect(seen).toEqual([null]);

      localStorage.setItem(
        'airguard_dev_auth',
        JSON.stringify({ uid: 'dev-b', email: 'b@example.com', name: 'Account B' }),
      );
      window.dispatchEvent(new CustomEvent('dev-auth-change'));
      expect(seen[1]).toEqual({
        uid: 'dev-b',
        email: 'b@example.com',
        name: 'Account B',
        photoURL: null,
        isDev: true,
      });

      stop();
      localStorage.removeItem('airguard_dev_auth');
      window.dispatchEvent(new CustomEvent('dev-auth-change'));
      expect(seen).toHaveLength(2);
      expect(authMocks.onAuthStateChanged).not.toHaveBeenCalled();
    });

    it('derives dev tokens and the current user from local storage', async () => {
      await expect(getAppToken()).resolves.toBeNull();
      expect(getCurrentAppUser()).toBeNull();

      localStorage.setItem(
        'airguard_dev_auth',
        JSON.stringify({ uid: 'dev-c', email: 'c@example.com', name: 'Account C' }),
      );
      await expect(getAppToken()).resolves.toBe('dev:dev-c');
      expect(getCurrentAppUser()).toEqual({
        uid: 'dev-c',
        email: 'c@example.com',
        name: 'Account C',
        photoURL: null,
        isDev: true,
      });

      localStorage.setItem('airguard_dev_auth', 'corrupt');
      await expect(getAppToken()).resolves.toBeNull();
      expect(getCurrentAppUser()).toBeNull();
    });
  });
});
