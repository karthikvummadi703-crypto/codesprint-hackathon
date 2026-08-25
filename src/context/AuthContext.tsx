import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AppUser,
  onAppAuthStateChange,
  appSignUp,
  appLogin,
  appLoginWithGoogle,
  appResetPassword,
  appLogout,
} from '../services/authService';
import { getUser, saveUser } from '../services/dataService';

async function ensureUserDoc(user: AppUser) {
  try {
    const existing = await getUser(user.uid);
    if (!existing) {
      await saveUser(user.uid, {
        name: user.name || user.email || 'AirGuard User',
        email: user.email,
        photoURL: user.photoURL,
        location: '',
        preferences: {
          units: 'metric',
          notificationsEnabled: true,
          alertThreshold: 100,
        },
        createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('Failed to create user profile', e);
  }
}

interface AuthContextValue {
  user: AppUser | null;
  initializing: boolean;
  signup: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAppAuthStateChange((u) => {
      setUser(u);
      setInitializing(false);
    });

    const handleAuthError = () => {
      appLogout().then(() => {
        setUser(null);
      }).catch(console.error);
    };
    window.addEventListener('auth-error', handleAuthError);

    return () => {
      unsub();
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, []);

  const value: AuthContextValue = {
    user,
    initializing,
    signup: async (name, email, password) => {
      const user = await appSignUp(name, email, password);
      await ensureUserDoc(user);
    },
    login: async (email, password) => {
      const user = await appLogin(email, password);
      await ensureUserDoc(user);
    },
    loginWithGoogle: async () => {
      const user = await appLoginWithGoogle();
      await ensureUserDoc(user);
    },
    resetPassword: async (email) => {
      await appResetPassword(email);
    },
    logout: async () => {
      await appLogout();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

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
      return 'Google sign-in was cancelled.';
    default:
      return msg.replace(/^Firebase: /, '').replace(/ \(auth\/[^)]*\)\.?$/, '');
  }
}
