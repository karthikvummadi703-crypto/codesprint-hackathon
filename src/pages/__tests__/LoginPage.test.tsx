import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '../LoginPage';
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

function authError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  mocks.useAuth.mockReturnValue(makeAuth());
  mocks.firebaseErrorMessage.mockImplementation((err: unknown): string => {
    const code = (err as { code?: string }).code;
    return code ? `Formatted login error [${code}]` : 'Formatted login error';
  });
  mocks.isGoogleSignInAvailable.mockReturnValue(true);
});

describe('LoginPage', () => {
  it('renders the labelled sign-in form and its navigation links', async () => {
    const { container } = render(<LoginPage />);

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: 'Sign up free' })).toHaveAttribute('href', '/signup');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('requires both credentials before submitting', async () => {
    const login = vi.fn(async () => {});
    mocks.useAuth.mockReturnValue(makeAuth({ login }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    expect(screen.getByRole('textbox', { name: 'Email address' })).toBeRequired();
    expect(screen.getByLabelText('Password')).toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(login).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a loading state then navigates after a successful sign-in', async () => {
    const pending = deferred<void>();
    const login = vi.fn(() => pending.promise);
    mocks.useAuth.mockReturnValue(makeAuth({ login }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(login).toHaveBeenCalledWith('ada@example.com', 'correct-horse');
    expect(await screen.findByRole('button', { name: /Processing/ })).toBeDisabled();
    expect((await axe(container)).violations).toEqual([]);

    await act(async () => {
      pending.resolve(undefined);
    });

    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a formatted error and resets loading when sign-in fails', async () => {
    const login = vi.fn(async () => {
      throw authError('auth/invalid-credential', 'Firebase: invalid credential');
    });
    mocks.useAuth.mockReturnValue(makeAuth({ login }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Formatted login error [auth/invalid-credential]',
    );
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    const password = screen.getByLabelText('Password');
    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show).toHaveAttribute('aria-pressed', 'false');

    await user.click(show);
    expect(password).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    await user.click(hide);
    expect(password).toHaveAttribute('type', 'password');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('navigates to the dashboard after a completed Google sign-in', async () => {
    const loginWithGoogle = vi.fn(async () => true);
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(loginWithGoogle).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('keeps loading active without navigating when the Google popup falls back to redirect', async () => {
    const loginWithGoogle = vi.fn(async () => false);
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(loginWithGoogle).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Processing/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('reports a blocked Google popup and re-enables the form', async () => {
    const loginWithGoogle = vi.fn(async () => {
      throw authError('auth/popup-blocked', 'Firebase: popup blocked');
    });
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Formatted login error [auth/popup-blocked]');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('disables Google sign-in when Firebase is not configured', async () => {
    mocks.isGoogleSignInAvailable.mockReturnValue(false);
    const loginWithGoogle = vi.fn(async () => true);
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<LoginPage />);

    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(google).toBeDisabled();
    expect(google).toHaveAttribute('title', 'Google sign-in requires Firebase configuration');
    await user.click(google);
    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
