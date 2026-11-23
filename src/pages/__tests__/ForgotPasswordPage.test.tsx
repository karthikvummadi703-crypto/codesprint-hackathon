import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import type { UserProfile } from '../../services/profileService';
import ForgotPasswordPage from '../ForgotPasswordPage';

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
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

async function expectAxeViolations(container: HTMLElement, expectedIds: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual(expectedIds);
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it('renders the reset form and its sign-in link with no axe violations', async () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email Address' })).toHaveAttribute(
      'placeholder',
      'you@example.com',
    );
    expect(screen.getByRole('textbox', { name: 'Email Address' })).toBeRequired();
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Back to Sign In' })).toHaveAttribute('href', '/login');
    await expectAxeViolations(container);
  });

  it('does not request a reset for empty or malformed email addresses', async () => {
    const auth = mockAuth();
    const user = userEvent.setup();
    const { container } = renderPage();
    const email = screen.getByRole('textbox', { name: 'Email Address' });

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(auth.resetPassword).not.toHaveBeenCalled();

    await user.type(email, 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));
    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('shows a disabled loading state and then confirms the address that was submitted', async () => {
    const pending = deferred<void>();
    const auth = mockAuth({
      resetPassword: vi.fn<(email: string) => Promise<void>>().mockReturnValue(pending.promise),
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.type(screen.getByRole('textbox', { name: 'Email Address' }), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(auth.resetPassword).toHaveBeenCalledWith('user@example.com');
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    await expectAxeViolations(container);

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Email Address' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Sign In' })).toHaveAttribute('href', '/login');
  });

  it('shows a mapped reset error and clears it after a successful retry', async () => {
    const auth = mockAuth({
      resetPassword: vi
        .fn<(email: string) => Promise<void>>()
        .mockRejectedValueOnce(
          Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), {
            code: 'auth/network-request-failed',
          }),
        )
        .mockResolvedValueOnce(undefined),
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.type(screen.getByRole('textbox', { name: 'Email Address' }), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network error. Check your connection.',
    );
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeEnabled();
    await expectAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(auth.resetPassword).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
