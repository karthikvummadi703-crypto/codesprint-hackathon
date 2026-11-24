import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SignupPage from '../SignupPage';
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

async function fillValidForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByRole('textbox', { name: 'Full Name' }), 'Grace Hopper');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'grace@example.com');
  await user.type(screen.getByLabelText('Password'), 'compiler123');
  await user.type(screen.getByLabelText('Confirm Password'), 'compiler123');
}

beforeEach(() => {
  mocks.useAuth.mockReturnValue(makeAuth());
  mocks.firebaseErrorMessage.mockImplementation((err: unknown): string => {
    const code = (err as { code?: string }).code;
    return code ? `Formatted signup error [${code}]` : 'Formatted signup error';
  });
  mocks.isGoogleSignInAvailable.mockReturnValue(true);
});

describe('SignupPage', () => {
  it('renders the labelled sign-up form and link to sign in', async () => {
    const { container } = render(<SignupPage />);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Full Name' })).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows validation alerts for an empty submission without calling signup', async () => {
    const signup = vi.fn(async () => {});
    mocks.useAuth.mockReturnValue(makeAuth({ signup }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(signup).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('flags a malformed email and mismatched passwords', async () => {
    const signup = vi.fn(async () => {});
    mocks.useAuth.mockReturnValue(makeAuth({ signup }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    await user.type(screen.getByRole('textbox', { name: 'Full Name' }), 'Grace Hopper');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'compiler123');
    await user.type(screen.getByLabelText('Confirm Password'), 'different456');
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }).closest('form')!);

    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a loading state then navigates after a successful sign-up', async () => {
    const pending = deferred<void>();
    const signup = vi.fn(() => pending.promise);
    mocks.useAuth.mockReturnValue(makeAuth({ signup }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(signup).toHaveBeenCalledWith('Grace Hopper', 'grace@example.com', 'compiler123');
    expect(await screen.findByRole('button', { name: /Processing/ })).toBeDisabled();
    expect((await axe(container)).violations).toEqual([]);

    await act(async () => {
      pending.resolve(undefined);
    });

    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a formatted error and resets loading when sign-up fails', async () => {
    const signup = vi.fn(async () => {
      throw authError('auth/email-already-in-use', 'Firebase: email in use');
    });
    mocks.useAuth.mockReturnValue(makeAuth({ signup }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Formatted signup error [auth/email-already-in-use]',
    );
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('toggles password visibility without changing the confirm field', async () => {
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    const password = screen.getByLabelText('Password');
    const confirm = screen.getByLabelText('Confirm Password');
    const show = screen.getByRole('button', { name: 'Show password' });
    expect(show).toHaveAttribute('aria-pressed', 'false');

    await user.type(password, 'compiler123');
    await user.click(show);

    expect(password).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('navigates to the dashboard after a completed Google sign-up', async () => {
    const loginWithGoogle = vi.fn(async () => true);
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(loginWithGoogle).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('keeps loading active without navigating when Google sign-up returns false', async () => {
    const loginWithGoogle = vi.fn(async () => false);
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

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

    const { container } = render(<SignupPage />);

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Formatted signup error [auth/popup-blocked]');
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('disables Google sign-up when Firebase is not configured', async () => {
    mocks.isGoogleSignInAvailable.mockReturnValue(false);
    const loginWithGoogle = vi.fn(async () => true);
    mocks.useAuth.mockReturnValue(makeAuth({ loginWithGoogle }));
    const user = userEvent.setup();

    const { container } = render(<SignupPage />);

    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(google).toBeDisabled();
    expect(google).toHaveAttribute('title', 'Google sign-up requires Firebase configuration');
    await user.click(google);
    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
