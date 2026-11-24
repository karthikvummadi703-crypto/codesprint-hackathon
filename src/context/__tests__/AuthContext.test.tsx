import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../AuthContext';
import type { AppUser } from '../../services/authService';
import type { UserProfile } from '../../services/profileService';

type AuthValue = ReturnType<typeof useAuth>;

const mocks = vi.hoisted(() => ({
  listener: null as ((user: AppUser | null) => void | Promise<void>) | null,
  unsubscribe: vi.fn<() => void>(),
  onAppAuthStateChange: vi.fn<(cb: (user: AppUser | null) => void | Promise<void>) => () => void>(),
  appSignUp: vi.fn<(name: string, email: string, password: string) => Promise<AppUser>>(),
  appLogin: vi.fn<(email: string, password: string) => Promise<AppUser>>(),
  appLoginWithGoogle: vi.fn<() => Promise<AppUser | null>>(),
  appCompleteGoogleRedirect: vi.fn<() => Promise<AppUser | null>>(),
  appResetPassword: vi.fn<(email: string) => Promise<void>>(),
  appLogout: vi.fn<() => Promise<void>>(),
  clearResponseCache: vi.fn<() => void>(),
  saveUser: vi.fn<(uid: string, data: Record<string, unknown>) => Promise<void>>(),
  ensureProfile: vi.fn<(user: AppUser) => Promise<UserProfile | null>>(),
  saveProfileName: vi.fn<(uid: string, name: string) => Promise<void>>(),
  loadProfile: vi.fn<(uid: string) => Promise<UserProfile | null>>(),
}));

vi.mock('../../services/authService', () => ({
  onAppAuthStateChange: mocks.onAppAuthStateChange,
  appSignUp: mocks.appSignUp,
  appLogin: mocks.appLogin,
  appLoginWithGoogle: mocks.appLoginWithGoogle,
  appCompleteGoogleRedirect: mocks.appCompleteGoogleRedirect,
  appResetPassword: mocks.appResetPassword,
  appLogout: mocks.appLogout,
}));

vi.mock('../../services/apiClient', () => ({
  clearResponseCache: mocks.clearResponseCache,
}));

vi.mock('../../services/dataService', () => ({
  saveUser: mocks.saveUser,
}));

vi.mock('../../services/profileService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/profileService')>();
  return {
    ...actual,
    ensureProfile: mocks.ensureProfile,
    loadProfile: mocks.loadProfile,
    saveProfileName: mocks.saveProfileName,
  };
});

const ada: AppUser = {
  uid: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  photoURL: 'https://example.test/ada.png',
  isDev: false,
};

let current: AuthValue | null = null;

function authValue(): AuthValue {
  if (!current) throw new Error('Auth probe did not render');
  return current;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function emitAuth(user: AppUser | null): Promise<void> {
  const listener = mocks.listener;
  if (!listener) throw new Error('Auth listener was not registered');
  await act(async () => {
    await listener(user);
  });
}

function AuthProbe() {
  const value = useAuth();
  useEffect(() => {
    current = value;
  }, [value]);
  return (
    <main>
      <h1>Auth probe</h1>
      <p data-testid="uid">{value.user?.uid ?? 'signed-out'}</p>
      <p data-testid="display-name">{value.displayName}</p>
      <p data-testid="avatar">{value.avatarUrl ?? 'no-avatar'}</p>
      <p data-testid="initializing">{String(value.initializing)}</p>
      <p data-testid="profile-loading">{String(value.profileLoading)}</p>
      <p data-testid="profile-name">{value.profile?.name ?? 'no-profile'}</p>
      <p data-testid="profile-location">{value.profile?.location ?? 'no-location'}</p>
      <button type="button" onClick={() => value.syncProfileLocally({ location: 'Hyderabad' })}>
        Apply local profile patch
      </button>
    </main>
  );
}

function OutsideAuthProbe() {
  let message = 'useAuth unexpectedly returned a value';
  try {
    useAuth();
  } catch (error) {
    message = error instanceof Error ? error.message : 'unknown error';
  }
  return <p>{message}</p>;
}

function renderProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

beforeEach(() => {
  current = null;
  mocks.listener = null;
  mocks.unsubscribe.mockReset();
  mocks.onAppAuthStateChange.mockReset().mockImplementation((cb) => {
    mocks.listener = cb;
    return mocks.unsubscribe;
  });
  mocks.appSignUp.mockReset();
  mocks.appLogin.mockReset();
  mocks.appLoginWithGoogle.mockReset();
  mocks.appCompleteGoogleRedirect.mockReset().mockResolvedValue(null);
  mocks.appResetPassword.mockReset().mockResolvedValue(undefined);
  mocks.appLogout.mockReset().mockResolvedValue(undefined);
  mocks.clearResponseCache.mockReset();
  mocks.saveUser.mockReset().mockResolvedValue(undefined);
  mocks.ensureProfile.mockReset().mockResolvedValue(null);
  mocks.saveProfileName.mockReset().mockResolvedValue(undefined);
  mocks.loadProfile.mockReset().mockResolvedValue(null);
});

describe('AuthProvider', () => {
  it('mounts signed out, completes the Google redirect and registers the auth listener', async () => {
    const { container } = renderProvider();

    expect(screen.getByTestId('uid')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('initializing')).toHaveTextContent('true');
    expect(screen.getByTestId('display-name')).toHaveTextContent('AirGuard User');
    expect(mocks.appCompleteGoogleRedirect).toHaveBeenCalledTimes(1);
    expect(mocks.onAppAuthStateChange).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();

    await expectAccessible(container);
  });

  it('loads the profile for the authenticated user and resolves name and avatar', async () => {
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.', photoURL: '/ada-override.png' });
    const { container } = renderProvider();

    await emitAuth(ada);

    expect(screen.getByTestId('uid')).toHaveTextContent('u1');
    expect(screen.getByTestId('display-name')).toHaveTextContent('Ada L.');
    expect(screen.getByTestId('avatar')).toHaveTextContent('/ada-override.png');
    expect(screen.getByTestId('initializing')).toHaveTextContent('false');
    expect(screen.getByTestId('profile-loading')).toHaveTextContent('false');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Ada L.');
    expect(mocks.ensureProfile).toHaveBeenCalledWith(ada);

    await expectAccessible(container);
  });

  it('falls back to auth name, email local-part and provider photo for an empty profile', async () => {
    mocks.ensureProfile.mockResolvedValueOnce({ name: '   ', photoURL: null });
    const { container } = renderProvider();

    await emitAuth(ada);
    expect(screen.getByTestId('display-name')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('avatar')).toHaveTextContent('https://example.test/ada.png');

    await emitAuth({ ...ada, name: null, photoURL: null });
    expect(screen.getByTestId('display-name')).toHaveTextContent('ada');
    expect(screen.getByTestId('avatar')).toHaveTextContent('no-avatar');

    await expectAccessible(container);
  });

  it('clears the previous account immediately on sign-out and unsubscribes on unmount', async () => {
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const view = renderProvider();

    await emitAuth(ada);
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Ada L.');

    await emitAuth(null);
    expect(screen.getByTestId('uid')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('no-profile');
    expect(screen.getByTestId('profile-loading')).toHaveTextContent('false');
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);

    await expectAccessible(view.container);
    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith('auth-error', expect.any(Function));
  });

  it('ignores a delayed profile read after the signed-in account changes', async () => {
    const slowRead = deferred<UserProfile | null>();
    mocks.ensureProfile.mockReturnValueOnce(slowRead.promise).mockResolvedValueOnce({ name: 'Grace Hopper' });
    const { container } = renderProvider();

    act(() => {
      void mocks.listener?.(ada);
    });

    await emitAuth({ ...ada, uid: 'u2', name: 'Grace Hopper' });
    expect(screen.getByTestId('display-name')).toHaveTextContent('Grace Hopper');

    await act(async () => {
      slowRead.resolve({ name: 'Ada L.' });
    });

    expect(screen.getByTestId('profile-name')).toHaveTextContent('Grace Hopper');
    expect(screen.getByTestId('display-name')).toHaveTextContent('Grace Hopper');
    expect(screen.getByTestId('profile-loading')).toHaveTextContent('false');

    await expectAccessible(container);
  });

  it('logs out and clears cached responses when an auth-error event fires', async () => {
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const { container } = renderProvider();
    await emitAuth(ada);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth-error'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('uid')).toHaveTextContent('signed-out'));
    expect(mocks.appLogout).toHaveBeenCalledTimes(1);
    expect(mocks.clearResponseCache).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('profile-name')).toHaveTextContent('no-profile');

    await expectAccessible(container);
  });

  it('keeps the session when the auth-error logout fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const { container } = renderProvider();
    await emitAuth(ada);

    mocks.appLogout.mockRejectedValueOnce(new Error('sign-out failed'));
    act(() => {
      window.dispatchEvent(new CustomEvent('auth-error'));
    });

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(expect.any(Error)));
    expect(screen.getByTestId('uid')).toHaveTextContent('u1');
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Ada L.');
    expect(mocks.clearResponseCache).not.toHaveBeenCalled();

    await expectAccessible(container);
  });

  it('reports a failed Google redirect completion without breaking the provider', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('redirect failed');
    mocks.appCompleteGoogleRedirect.mockRejectedValueOnce(failure);
    const { container } = renderProvider();

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(failure));
    expect(screen.getByRole('heading', { name: 'Auth probe' })).toBeInTheDocument();

    await expectAccessible(container);
  });

  it('signs up and logs in through the service and ensures a profile each time', async () => {
    const signedUp: AppUser = { ...ada, uid: 'new-user' };
    const loggedIn: AppUser = { ...ada, uid: 'returning-user' };
    mocks.appSignUp.mockResolvedValue(signedUp);
    mocks.appLogin.mockResolvedValue(loggedIn);
    const { container } = renderProvider();

    await act(async () => {
      await authValue().signup('Ada', 'ada@example.com', 'password');
    });
    await act(async () => {
      await authValue().login('ada@example.com', 'password');
    });

    expect(mocks.appSignUp).toHaveBeenCalledWith('Ada', 'ada@example.com', 'password');
    expect(mocks.appLogin).toHaveBeenCalledWith('ada@example.com', 'password');
    expect(mocks.ensureProfile).toHaveBeenNthCalledWith(1, signedUp);
    expect(mocks.ensureProfile).toHaveBeenNthCalledWith(2, loggedIn);

    await expectAccessible(container);
  });

  it('returns false for a Google redirect fallback and true for a completed sign-in', async () => {
    mocks.appLoginWithGoogle.mockResolvedValueOnce(null).mockResolvedValueOnce(ada);
    const { container } = renderProvider();
    let firstResult: boolean | null = null;
    let secondResult: boolean | null = null;

    await act(async () => {
      firstResult = await authValue().loginWithGoogle();
    });
    await act(async () => {
      secondResult = await authValue().loginWithGoogle();
    });

    expect(firstResult).toBe(false);
    expect(secondResult).toBe(true);
    expect(mocks.ensureProfile).toHaveBeenCalledTimes(1);
    expect(mocks.ensureProfile).toHaveBeenCalledWith(ada);

    await expectAccessible(container);
  });

  it('delegates password reset and clears the profile and cache on logout', async () => {
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const { container } = renderProvider();
    await emitAuth(ada);

    await act(async () => {
      await authValue().resetPassword('ada@example.com');
    });
    await act(async () => {
      await authValue().logout();
    });

    expect(mocks.appResetPassword).toHaveBeenCalledWith('ada@example.com');
    expect(mocks.appLogout).toHaveBeenCalledTimes(1);
    expect(mocks.clearResponseCache).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('profile-name')).toHaveTextContent('no-profile');

    await expectAccessible(container);
  });

  it('trims and persists a name change and rejects invalid or signed-out changes', async () => {
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const { container } = renderProvider();
    await emitAuth(ada);

    await act(async () => {
      await authValue().updateName('  Grace Hopper  ');
    });
    expect(mocks.saveProfileName).toHaveBeenCalledWith('u1', 'Grace Hopper');
    expect(screen.getByTestId('display-name')).toHaveTextContent('Grace Hopper');

    await expect(authValue().updateName('   ')).rejects.toThrow('Name cannot be empty.');
    await emitAuth(null);
    await expect(authValue().updateName('Someone')).rejects.toThrow('Not signed in.');

    await expectAccessible(container);
  });

  it('persists avatar overrides including a deliberate null and rejects when signed out', async () => {
    const photo = 'data:image/png;base64,AAA';
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const { container } = renderProvider();
    await emitAuth(ada);

    await act(async () => {
      await authValue().updateAvatar(photo);
    });
    expect(mocks.saveUser).toHaveBeenCalledWith('u1', { photoURL: photo });
    expect(screen.getByTestId('avatar')).toHaveTextContent(photo);

    await act(async () => {
      await authValue().updateAvatar(null);
    });
    expect(screen.getByTestId('avatar')).toHaveTextContent('https://example.test/ada.png');

    await emitAuth(null);
    await expect(authValue().updateAvatar(photo)).rejects.toThrow('Not signed in.');

    await expectAccessible(container);
  });

  it('applies a local profile patch without writing to storage', async () => {
    mocks.ensureProfile.mockResolvedValue({ name: 'Ada L.' });
    const user = userEvent.setup();
    const { container } = renderProvider();
    await emitAuth(ada);

    await user.click(screen.getByRole('button', { name: 'Apply local profile patch' }));

    expect(screen.getByTestId('profile-location')).toHaveTextContent('Hyderabad');
    expect(mocks.saveUser).not.toHaveBeenCalled();

    await expectAccessible(container);
  });
});

describe('useAuth', () => {
  it('explains when it is used outside AuthProvider', async () => {
    const { container } = render(<OutsideAuthProbe />);

    expect(screen.getByText('useAuth must be used within AuthProvider')).toBeInTheDocument();

    await expectAccessible(container);
  });
});
