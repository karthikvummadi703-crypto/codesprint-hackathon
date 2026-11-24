import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ForgotPasswordPage from '../ForgotPasswordPage';
import type { useAuth as useAuthType } from '../../context/AuthContext';

type AuthValue = ReturnType<typeof useAuthType>;

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  firebaseErrorMessage: vi.fn(),
  isGoogleSignInAvailable: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: mocks.useAuth,
  firebaseErrorMessage: mocks.firebaseErrorMessage,
}));
vi.mock('../../services/authService', () => ({
  isGoogleSignInAvailable: mocks.isGoogleSignInAvailable,
}));
vi.mock('react-router-dom', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ to, children }: { to: string; children: ReactNode }) =>
      createElement('a', { href: to }, children),
    useNavigate: () => mocks.navigate,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    user: null,
    displayName: '',
    avatarUrl: null,
    profile: null,
    profileLoading: false,
    initializing: false,
    signup: vi.fn(async () => {}),
    login: vi.fn(async () => {}),
    loginWithGoogle: vi.fn(async () => true),
    resetPassword: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    updateName: vi.fn(async () => {}),
    updateAvatar: vi.fn(async () => {}),
    syncProfileLocally: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.useAuth.mockReturnValue(makeAuth());
  mocks.firebaseErrorMessage.mockImplementation((err: unknown): string => {
    const code = (err as { code?: string }).code;
    return code ? `Formatted reset error [${code}]` : 'Formatted reset error';
  });
  mocks.isGoogleSignInAvailable.mockReturnValue(true);
});

describe('ForgotPasswordPage', () => {
  it('renders the reset request form and back link', async () => {
    const { container } = render(<ForgotPasswordPage />);

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByText("We'll send you an email with password reset instructions.")).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email Address' })).toBeRequired();
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Back to Sign In' })).toHaveAttribute('href', '/login');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('does not request a reset for an empty email', async () => {
    const resetPassword = vi.fn(async () => {});
    mocks.useAuth.mockReturnValue(makeAuth({ resetPassword }));
    const user = userEvent.setup();

    const { container } = render(<ForgotPasswordPage />);

    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a loading state and then the confirmation with the submitted email', async () => {
    const pending = deferred<void>();
    const resetPassword = vi.fn(() => pending.promise);
    mocks.useAuth.mockReturnValue(makeAuth({ resetPassword }));
    const user = userEvent.setup();

    const { container } = render(<ForgotPasswordPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email Address' }), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(resetPassword).toHaveBeenCalledWith('ada@example.com');
    expect(await screen.findByRole('button', { name: /Processing/ })).toBeDisabled();
    expect((await axe(container)).violations).toEqual([]);

    await act(async () => {
      pending.resolve(undefined);
    });

    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset Password|Processing/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Sign In' })).toHaveAttribute('href', '/login');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a formatted error and resets loading when the reset request fails', async () => {
    const resetPassword = vi.fn(async () => {
      throw Object.assign(new Error('Firebase: user not found'), { code: 'auth/user-not-found' });
    });
    mocks.useAuth.mockReturnValue(makeAuth({ resetPassword }));
    const user = userEvent.setup();

    const { container } = render(<ForgotPasswordPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email Address' }), 'missing@example.com');
    await user.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Formatted reset error [auth/user-not-found]');
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
