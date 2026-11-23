import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import type { UserProfile } from '../../services/profileService';
import { isGoogleSignInAvailable } from '../../services/authService';
import LoginPage from '../LoginPage';

vi.mock('../../services/firebase', () => ({
  isFirebaseConfigured: false,
  auth: null,
  app: null,
  db: null,
  storage: null,
  API_BASE_URL: 'http://localhost.test',
}));
vi.mock('../../services/dataService', () => ({
  getUser: vi.fn(),
  saveUser: vi.fn(),
}));
vi.mock('../../services/authService', () => ({
  isGoogleSignInAvailable: vi.fn(),
  onAppAuthStateChange: vi.fn(() => () => {}),
  appSignUp: vi.fn(),
  appLogin: vi.fn(),
  appLoginWithGoogle: vi.fn(),
  appResetPassword: vi.fn(),
  appLogout: vi.fn(),
  getAppToken: vi.fn(),
  getCurrentAppUser: vi.fn(),
}));
vi.mock('../../context/AuthContext', async importOriginal => {
  const actual = await importOriginal<typeof import('../../context/AuthContext')>();
  return { ...actual, useAuth: vi.fn() };
});
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn() };
});

type AuthValue = ReturnType<typeof useAuth>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createNavigateMock() {
  const navigate = vi.fn(() => {});
  return navigate as unknown as ReturnType<typeof useNavigate> & typeof navigate;
}

function createAuthValue(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    user: null,
    displayName: '',
    avatarUrl: null,
    profile: null,
    profileLoading: false,
    initializing: false,
    signup: vi
      .fn<(name: string, email: string, password: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    login: vi.fn<(email: string, password: string) => Promise<void>>().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    resetPassword: vi.fn<(email: string) => Promise<void>>().mockResolvedValue(undefined),
    logout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    updateName: vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined),
    updateAvatar: vi.fn<(photoURL: string | null) => Promise<void>>().mockResolvedValue(undefined),
    syncProfileLocally: vi.fn<(patch: Partial<UserProfile>) => void>(),
    ...overrides,
  };
}

function mockAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  const value = createAuthValue(overrides);
  vi.mocked(useAuth).mockReturnValue(value);
  return value;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

async function expectAxeViolations(container: HTMLElement, expectedIds: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual(expectedIds);
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGoogleSignInAvailable).mockReturnValue(false);
    vi.mocked(useNavigate).mockReturnValue(createNavigateMock());
    mockAuth();
  });

  it('renders labelled credentials, navigation links and a disabled Google option', async () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveAttribute(
      'placeholder',
      'you@example.com',
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Sign up free' })).toHaveAttribute('href', '/signup');

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(googleButton).toBeDisabled();
    expect(googleButton).toHaveAttribute('title', 'Google sign-in requires Firebase configuration');

    await expectAxeViolations(container);
  });

  it('does not submit when required credentials are missing', async () => {
    const auth = mockAuth();
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(auth.login).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });

  it('toggles password visibility and its pressed state', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const password = screen.getByLabelText('Password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await expectAxeViolations(container);
  });

  it('shows a disabled loading state while email sign-in is pending and keeps it after navigation when mounted', async () => {
    const pending = deferred<void>();
    const login = vi
      .fn<(email: string, password: string) => Promise<void>>()
      .mockReturnValue(pending.promise);
    const auth = mockAuth({ login });
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(auth.login).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
  });

  it('shows a mapped credential error and keeps the form usable after a failed sign-in', async () => {
    const login = vi.fn<(email: string, password: string) => Promise<void>>().mockRejectedValue(
      Object.assign(new Error('Firebase: Error (auth/invalid-credential).'), {
        code: 'auth/invalid-credential',
      }),
    );
    mockAuth({ login });
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.getByRole('button', { name: /Sign In/ })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });

  it('signs in with Google when the provider is configured', async () => {
    vi.mocked(isGoogleSignInAvailable).mockReturnValue(true);
    const auth = mockAuth();
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(googleButton).toBeEnabled();
    expect(googleButton).not.toHaveAttribute('title');
    await user.click(googleButton);

    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    await expectAxeViolations(container);
  });

  it('shows a mapped error after Google sign-in is cancelled', async () => {
    vi.mocked(isGoogleSignInAvailable).mockReturnValue(true);
    mockAuth({
      loginWithGoogle: vi.fn<() => Promise<void>>().mockRejectedValue(
        Object.assign(new Error('Firebase: Error (auth/popup-closed-by-user).'), {
          code: 'auth/popup-closed-by-user',
        }),
      ),
    });
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in was cancelled.');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });
});
