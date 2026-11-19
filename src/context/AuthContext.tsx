import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  AppUser,
  onAppAuthStateChange,
  appSignUp,
  appLogin,
  appLoginWithGoogle,
  appResetPassword,
  appLogout,
} from '../services/authService';
import { clearResponseCache } from '../services/apiClient';
import { saveUser } from '../services/dataService';
import {
  UserProfile,
  ensureProfile,
  loadProfile,
  resolveDisplayName,
  saveProfileName,
} from '../services/profileService';

interface AuthContextValue {
  user: AppUser | null;
  /** The user's real name, resolved from their profile then the auth provider. */
  displayName: string;
  /**
   * The avatar to render: the profile override when set, otherwise the auth
   * provider's photo. `null` means "show initials".
   */
  avatarUrl: string | null;
  profile: UserProfile | null;
  /** True until the profile for the current user has been read. */
  profileLoading: boolean;
  initializing: boolean;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Persist a name change and refresh the resolved name everywhere. */
  updateName: (name: string) => Promise<void>;
  /** Persist a profile photo (data URL) or clear it with `null`. */
  updateAvatar: (photoURL: string | null) => Promise<void>;
  /** Refresh the in-memory profile after a settings save without a second write. */
  syncProfileLocally: (patch: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  // Tracks the newest auth callback so a slow profile read from a previous
  // account cannot overwrite the current user's data.
  const latestUid = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAppAuthStateChange(async (u) => {
      latestUid.current = u?.uid ?? null;
      setUser(u);
      setInitializing(false);

      // Drop the previous account's profile immediately, otherwise a newly
      // signed-in user can briefly see the name that belonged to the last one.
      setProfile(null);
      if (!u) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const p = await ensureProfile(u);
      if (latestUid.current !== u.uid) return;
      setProfile(p);
      setProfileLoading(false);
    });

    const handleAuthError = () => {
      appLogout().then(() => {
        clearResponseCache();
        setUser(null);
        setProfile(null);
      }).catch(console.error);
    };
    window.addEventListener('auth-error', handleAuthError);

    return () => {
      unsub();
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, []);

  const displayName = resolveDisplayName(user, profile);
  // `??` (not `||`): an explicit `null` on the profile means the user removed
  // their photo, so it must not silently fall back to the provider's picture.
  const avatarUrl = profile?.photoURL ?? user?.photoURL ?? null;

  const updateName = useCallback(
    async (name: string) => {
      if (!user) throw new Error('Not signed in.');
      const clean = name.trim();
      if (!clean) throw new Error('Name cannot be empty.');
      await saveProfileName(user.uid, clean);
      setProfile((prev) => ({ ...(prev ?? {}), name: clean }));
    },
    [user],
  );

  const updateAvatar = useCallback(
    async (photoURL: string | null) => {
      if (!user) throw new Error('Not signed in.');
      await saveUser(user.uid, { photoURL });
      setProfile((prev) => ({ ...(prev ?? {}), photoURL }));
    },
    [user],
  );

  const syncProfileLocally = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...(prev ?? {}), ...patch }));
  }, []);

  const value: AuthContextValue = {
    user,
    displayName,
    avatarUrl,
    profile,
    profileLoading,
    initializing,
    updateName,
    updateAvatar,
    syncProfileLocally,
    signup: async (name, email, password) => {
      const user = await appSignUp(name, email, password);
      await ensureProfile(user);
    },
    login: async (email, password) => {
      const user = await appLogin(email, password);
      await ensureProfile(user);
    },
    loginWithGoogle: async () => {
      const user = await appLoginWithGoogle();
      await ensureProfile(user);
    },
    resetPassword: async (email) => {
      await appResetPassword(email);
    },
    logout: async () => {
      await appLogout();
      // Cached GETs are keyed by token, so drop them on sign-out rather than
      // relying on the key alone.
      clearResponseCache();
      setProfile(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { loadProfile };

export function firebaseErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (!e) return 'Something went wrong. Please try again.';
  const msg = e.message || String(err);
  switch (e.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Google sign-in. Add localhost (or 127.0.0.1) under Firebase Authentication > Settings > Authorized domains.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication.';
    default:
      return msg.replace(/^Firebase: /, '').replace(/ \(auth\/[^)]*\)\.?$/, '');
  }
}
