import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import { isGoogleSignInAvailable } from '../../services/authService';
import type { UserProfile } from '../../services/profileService';
import SignupPage from '../SignupPage';

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

async function fillSignupForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<'name' | 'email' | 'password' | 'confirm', string>> = {},
) {
  const values = {
    name: 'Karthik Reddy',
    email: 'karthik@example.com',
    password: 'password123',
    confirm: 'password123',
    ...overrides,
  };
  await user.type(screen.getByLabelText('Full Name'), values.name);
  await user.type(screen.getByLabelText('Email'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  await user.type(screen.getByLabelText('Confirm Password'), values.confirm);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

async function expectAxeViolations(container: HTMLElement, expectedIds: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual(expectedIds);
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isGoogleSignInAvailable).mockReturnValue(false);
    vi.mocked(useNavigate).mockReturnValue(createNavigateMock());
    mockAuth();
  });

  it('renders all signup fields, the legal-name email check and a disabled Google option', async () => {
    const { container } = renderPage();

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name')).toHaveAttribute('placeholder', 'Karthik Reddy');
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' });
    expect(googleButton).toBeDisabled();
    expect(googleButton).toHaveAttribute('title', 'Google sign-up requires Firebase configuration');
    await expectAxeViolations(container);
  });

  it('blocks submission and shows all four field errors for invalid input', async () => {
    const auth = mockAuth();
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await fillSignupForm(user, {
      name: '   ',
      email: 'not-an-email',
      password: 'short',
      confirm: 'different',
    });
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    const alerts = screen.getAllByRole('alert').map(node => node.textContent);
    expect(alerts).toEqual([
      'Name is required',
      'Enter a valid email',
      'Password must be at least 8 characters',
      'Passwords do not match',
    ]);
    expect(auth.signup).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });

  it('toggles password visibility while keeping the confirmation field masked', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    const password = screen.getByLabelText('Password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expectAxeViolations(container);
  });

  it('submits valid credentials and navigates to the dashboard', async () => {
    const pending = deferred<void>();
    const signup = vi
      .fn<(name: string, email: string, password: string) => Promise<void>>()
      .mockReturnValue(pending.promise);
    const auth = mockAuth({ signup });
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await fillSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(auth.signup).toHaveBeenCalledWith('Karthik Reddy', 'karthik@example.com', 'password123');
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

  it('shows a mapped email-in-use error and re-enables the form after failed signup', async () => {
    const signup = vi
      .fn<(name: string, email: string, password: string) => Promise<void>>()
      .mockRejectedValue(
        Object.assign(new Error('Firebase: Error (auth/email-already-in-use).'), {
          code: 'auth/email-already-in-use',
        }),
      );
    mockAuth({ signup });
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await fillSignupForm(user);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists.',
    );
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });

  it('signs up with Google when Firebase configuration is available', async () => {
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
    expect(auth.signup).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
    await expectAxeViolations(container);
  });

  it('shows a mapped popup-blocked error after failed Google signup', async () => {
    vi.mocked(isGoogleSignInAvailable).mockReturnValue(true);
    mockAuth({
      loginWithGoogle: vi.fn<() => Promise<void>>().mockRejectedValue(
        Object.assign(new Error('Firebase: Error (auth/popup-blocked).'), {
          code: 'auth/popup-blocked',
        }),
      ),
    });
    const navigate = createNavigateMock();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.',
    );
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });
});
