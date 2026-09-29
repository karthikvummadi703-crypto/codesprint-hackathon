import { AppUser } from './authService';
import { getUser, saveUser } from './dataService';

export interface UserProfile {
  name?: string;
  email?: string | null;
  photoURL?: string | null;
  location?: string;
  preferences?: {
    units: 'metric' | 'imperial';
    notificationsEnabled: boolean;
    alertThreshold: number;
  };
  createdAt?: string;
}

/** Shown only while a name is genuinely unavailable. Never a real person's name. */
export const ANONYMOUS_NAME = 'AirGuard User';

/**
 * The authenticated user's real display name.
 *
 * Resolution order, most trustworthy first:
 *   1. `users/{uid}.name` — the profile the user edited in Settings. This is the
 *      only source that works for an account created in the Firebase console or
 *      through Google, both of which leave the auth token's `displayName` null.
 *   2. The auth provider's own `displayName`.
 *   3. The email local-part, which the brief permits only when no name exists.
 *
 * The profile is keyed by the authenticated **uid**, never by email, so two
 * accounts sharing a display name cannot read each other's data and a stale
 * value from a previously signed-in account cannot leak into this one.
 */
export function resolveDisplayName(user: AppUser | null, profile: UserProfile | null): string {
  const fromProfile = typeof profile?.name === 'string' ? profile.name.trim() : '';
  if (fromProfile) return fromProfile;

  const fromAuth = typeof user?.name === 'string' ? user.name.trim() : '';
  if (fromAuth) return fromAuth;

  const localPart = user?.email?.split('@')[0]?.trim();
  if (localPart) return localPart;

  return ANONYMOUS_NAME;
}

/** Two-letter avatar initials, derived from whatever name was resolved. */
export function initialsFor(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DEFAULT_PREFERENCES = {
  units: 'metric' as const,
  notificationsEnabled: true,
  alertThreshold: 100,
};

/**
 * Create the profile document for a new account if it does not exist yet.
 *
 * The name is only written when one is actually known. Storing the email as a
 * name would freeze a placeholder into the profile, and Settings would then
 * show that placeholder as if the user had typed it.
 */
export async function ensureProfile(user: AppUser): Promise<UserProfile | null> {
  try {
    const existing = await getUser(user.uid);
    if (existing) {
      // Backfill an email on a profile created before it was captured, without
      // ever overwriting a name the user has since set.
      if (!existing.email && user.email && !existing.name) {
        await saveUser(user.uid, { email: user.email });
        return { ...existing, email: user.email };
      }
      return existing as UserProfile;
    }

    const seeded: UserProfile = {
      name: user.name || '',
      email: user.email,
      photoURL: user.photoURL,
      location: '',
      preferences: { ...DEFAULT_PREFERENCES },
      createdAt: new Date().toISOString(),
    };
    await saveUser(user.uid, seeded as unknown as Record<string, unknown>);
    return seeded;
  } catch (e) {
    // A missing profile must not block sign-in; the resolver falls back to the
    // auth provider's own name.
    console.error('Failed to load or create user profile', e);
    return null;
  }
}

export async function loadProfile(uid: string): Promise<UserProfile | null> {
  try {
    return (await getUser(uid)) as UserProfile | null;
  } catch (e) {
    console.error('Failed to load profile', e);
    return null;
  }
}

export async function saveProfileName(uid: string, name: string): Promise<void> {
  await saveUser(uid, { name: name.trim() });
}
