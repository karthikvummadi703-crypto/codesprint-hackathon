import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';

export interface AppUser {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  isDev: boolean;
}

export const DEV_UID = 'dev-user';

function toAppUser(u: FirebaseUser | null): AppUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    name: u.displayName,
    photoURL: u.photoURL,
    isDev: false,
  };
}

const DEV_KEY = 'airguard_dev_auth';

interface DevAccount {
  uid: string;
  email: string;
  name: string;
}

function devAccounts(): Record<string, DevAccount> {
  try {
    return JSON.parse(localStorage.getItem('airguard_dev_accounts') || '{}');
  } catch {
    return {};
  }
}

function saveDevAccounts(accounts: Record<string, DevAccount>) {
  localStorage.setItem('airguard_dev_accounts', JSON.stringify(accounts));
}

function currentDevUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(DEV_KEY);
    if (!raw) return null;
    const account: DevAccount = JSON.parse(raw);
    return {
      uid: account.uid,
      email: account.email,
      name: account.name,
      photoURL: null,
      isDev: true,
    };
  } catch {
    return null;
  }
}

function setCurrentDevUser(account: DevAccount | null) {
  if (account) localStorage.setItem(DEV_KEY, JSON.stringify(account));
  else localStorage.removeItem(DEV_KEY);
  // Notify listeners about dev auth state change
  window.dispatchEvent(new CustomEvent('dev-auth-change'));
}

export function onAppAuthStateChange(cb: (user: AppUser | null) => void): () => void {
  if (isFirebaseConfigured && auth) {
    return onAuthStateChanged(auth, (u) => cb(toAppUser(u)));
  }
  // Fire immediately with current state
  cb(currentDevUser());
  // Listen for future changes
  const handler = () => cb(currentDevUser());
  window.addEventListener('dev-auth-change', handler);
  return () => window.removeEventListener('dev-auth-change', handler);
}

export async function appSignUp(name: string, email: string, password: string): Promise<AppUser> {
  if (isFirebaseConfigured && auth) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    return toAppUser(cred.user)!;
  }
  await new Promise((r) => setTimeout(r, 600));
  const accounts = devAccounts();
  const existing = Object.values(accounts).find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error('An account with this email already exists.');
  const account: DevAccount = { uid: `dev-${Date.now()}`, email, name: name || email.split('@')[0] };
  accounts[account.uid] = account;
  saveDevAccounts(accounts);
  setCurrentDevUser(account);
  return { uid: account.uid, email: account.email, name: account.name, photoURL: null, isDev: true };
}

export async function appLogin(email: string, password: string): Promise<AppUser> {
  if (isFirebaseConfigured && auth) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return toAppUser(cred.user)!;
  }
  await new Promise((r) => setTimeout(r, 600));
  const account = Object.values(devAccounts()).find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!account) throw new Error('No account found with this email. Please sign up first.');
  if (password.length < 8) throw new Error('Invalid email or password.');
  setCurrentDevUser(account);
  return { uid: account.uid, email: account.email, name: account.name, photoURL: null, isDev: true };
}

export async function appLoginWithGoogle(): Promise<AppUser> {
  if (isFirebaseConfigured && auth) {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    return toAppUser(cred.user)!;
  }
  await new Promise((r) => setTimeout(r, 600));
  const account: DevAccount = { uid: `dev-${Date.now()}`, email: 'dev@airguard.local', name: 'Dev User' };
  const accounts = devAccounts();
  accounts[account.uid] = account;
  saveDevAccounts(accounts);
  setCurrentDevUser(account);
  return { uid: account.uid, email: account.email, name: account.name, photoURL: null, isDev: true };
}

export async function appResetPassword(email: string): Promise<void> {
  if (isFirebaseConfigured && auth) {
    await sendPasswordResetEmail(auth, email);
    return;
  }
  await new Promise((r) => setTimeout(r, 600));
}

export async function appLogout(): Promise<void> {
  if (isFirebaseConfigured && auth) {
    await signOut(auth);
    return;
  }
  setCurrentDevUser(null);
}

export async function getAppToken(): Promise<string | null> {
  if (isFirebaseConfigured && auth) {
    const u = auth.currentUser;
    if (!u) return null;
    return await u.getIdToken();
  }
  const user = currentDevUser();
  return user ? `dev:${user.uid}` : null;
}

export function getCurrentAppUser(): AppUser | null {
  if (isFirebaseConfigured) return null;
  return currentDevUser();
}
