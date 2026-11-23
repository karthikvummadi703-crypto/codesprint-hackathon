import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import type { AppUser } from '../services/authService';

type AuthCallback = (user: AppUser | null) => Promise<void>;

const mocks = vi.hoisted(() => ({
  authCallback: null as AuthCallback | null,
  onAppAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  appSignUp: vi.fn(),
  appLogin: vi.fn(),
  appLoginWithGoogle: vi.fn(),
  appResetPassword: vi.fn(),
  appLogout: vi.fn(),
  isGoogleSignInAvailable: vi.fn(),
  getAppToken: vi.fn(),
  getCurrentAppUser: vi.fn(),
  clearResponseCache: vi.fn(),
  getUser: vi.fn(),
  saveUser: vi.fn(),
  ensureProfile: vi.fn(),
  saveProfileName: vi.fn(),
  searchLocations: vi.fn(),
  reverseGeocode: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  isFirebaseConfigured: false,
  auth: null,
  app: null,
  db: null,
  storage: null,
  API_BASE_URL: 'http://localhost.test',
}));

vi.mock('../services/authService', () => ({
  onAppAuthStateChange: (callback: AuthCallback) => {
    mocks.authCallback = callback;
    return mocks.unsubscribe;
  },
  appSignUp: mocks.appSignUp,
  appLogin: mocks.appLogin,
  appLoginWithGoogle: mocks.appLoginWithGoogle,
  appResetPassword: mocks.appResetPassword,
  appLogout: mocks.appLogout,
  isGoogleSignInAvailable: mocks.isGoogleSignInAvailable,
  getAppToken: mocks.getAppToken,
  getCurrentAppUser: mocks.getCurrentAppUser,
  DEV_UID: 'dev-user',
}));

vi.mock('../services/apiClient', () => ({ clearResponseCache: mocks.clearResponseCache }));
vi.mock('../services/dataService', () => ({ getUser: mocks.getUser, saveUser: mocks.saveUser }));
vi.mock('../services/profileService', async importOriginal => {
  const actual = await importOriginal<typeof import('../services/profileService')>();
  return { ...actual, ensureProfile: mocks.ensureProfile, saveProfileName: mocks.saveProfileName };
});
vi.mock('../services/backendService', () => ({
  searchLocations: mocks.searchLocations,
  reverseGeocode: mocks.reverseGeocode,
}));

vi.mock('../pages/DashboardPage', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('section', { 'data-testid': 'page-dashboard' }, 'Dashboard page'),
  };
});
vi.mock('../pages/AIAssistantPage', async () => {
  const { createElement } = await import('react');
  return { default: () => createElement('section', { 'data-testid': 'page-ai' }, 'AI page') };
});
vi.mock('../pages/PredictionsPage', async () => {
  const { createElement } = await import('react');
  return {
    default: () =>
      createElement('section', { 'data-testid': 'page-predictions' }, 'Predictions page'),
  };
});
vi.mock('../pages/CarbonFootprintPage', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('section', { 'data-testid': 'page-carbon' }, 'Carbon page'),
  };
});
vi.mock('../pages/SettingsPage', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('section', { 'data-testid': 'page-settings' }, 'Settings page'),
  };
});
vi.mock('../pages/WeatherReportPage', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('section', { 'data-testid': 'page-weather' }, 'Weather page'),
  };
});
vi.mock('../pages/RoutinesPage', async () => {
  const { createElement } = await import('react');
  return {
    default: () => createElement('section', { 'data-testid': 'page-routines' }, 'Routines page'),
  };
});

const signedInUser: AppUser = {
  uid: 'u1',
  email: 'user@example.com',
  name: 'Display Name',
  photoURL: null,
  isDev: false,
};

function makeLocation() {
  return { name: 'Delhi', latitude: 28.6139, longitude: 77.209, region: 'Delhi', country: 'India' };
}

function renderApp(path = '/') {
  window.history.pushState({}, '', path);
  return render(<App />);
}

async function emitAuth(user: AppUser | null) {
  await act(async () => {
    await mocks.authCallback?.(user);
  });
}

async function signIn(user: AppUser | null = signedInUser) {
  await emitAuth(user);
}

async function expectAxeViolations(container: HTMLElement, expectedIds: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual(expectedIds);
}

describe('App routing and guards', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockReset().mockRejectedValue(new Error('Unexpected network call'));
    mocks.authCallback = null;
    mocks.unsubscribe.mockReset().mockImplementation(() => undefined);
    mocks.appSignUp.mockReset().mockResolvedValue(signedInUser);
    mocks.appLogin.mockReset().mockResolvedValue(signedInUser);
    mocks.appLoginWithGoogle.mockReset().mockResolvedValue(signedInUser);
    mocks.appResetPassword.mockReset().mockResolvedValue(undefined);
    mocks.appLogout.mockReset().mockResolvedValue(undefined);
    mocks.isGoogleSignInAvailable.mockReset().mockReturnValue(false);
    mocks.getAppToken.mockReset().mockResolvedValue(null);
    mocks.getCurrentAppUser.mockReset().mockReturnValue(null);
    mocks.clearResponseCache.mockReset().mockImplementation(() => undefined);
    mocks.getUser.mockReset().mockResolvedValue(null);
    mocks.saveUser.mockReset().mockResolvedValue(undefined);
    mocks.ensureProfile.mockReset().mockResolvedValue({ name: 'Display Name' });
    mocks.saveProfileName.mockReset().mockResolvedValue(undefined);
    mocks.searchLocations.mockReset().mockResolvedValue([]);
    mocks.reverseGeocode
      .mockReset()
      .mockResolvedValue({ name: 'Delhi', region: 'Delhi', country: 'India' });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
    localStorage.clear();
  });

  it('shows the initialization splash until Firebase reports auth state', async () => {
    const { container } = renderApp('/');

    expect(screen.getByText('Loading AirGuard AI…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('redirects signed-out visitors from a protected route to the login page', async () => {
    const { container } = renderApp('/');

    await signIn(null);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText('Loading AirGuard AI…')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('renders the public signup page for signed-out visitors', async () => {
    const { container } = renderApp('/signup');

    await signIn(null);

    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/signup');
    await expectAxeViolations(container);
  });

  it('renders the public reset-password page for signed-out visitors', async () => {
    const { container } = renderApp('/forgot-password');

    await signIn(null);

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/forgot-password');
    await expectAxeViolations(container);
  });

  it('redirects signed-in visitors away from /login and asks for a location', async () => {
    const { container } = renderApp('/login');

    await signIn();

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Where should we measure?' }),
    ).toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('requires a location before rendering the protected app shell', async () => {
    const { container } = renderApp('/dashboard');

    await signIn();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Where should we measure?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Skip to main content' })).not.toBeInTheDocument();
    expect(mocks.searchLocations).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    await expectAxeViolations(container);
  });

  it('enters the app shell after choosing a searched location', async () => {
    const user = userEvent.setup();
    mocks.searchLocations.mockResolvedValue([
      {
        name: 'Delhi',
        latitude: 28.6139,
        longitude: 77.209,
        region: 'Delhi',
        country: 'India',
        label: 'Delhi, India',
      },
    ]);
    const { container } = renderApp('/dashboard');
    await signIn();

    await user.type(screen.getByRole('combobox', { name: 'Search for a city or place' }), 'Del');
    await user.click(await screen.findByRole('option', { name: /Delhi/ }, { timeout: 1000 }));

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument();
    expect(await screen.findByTestId('page-dashboard')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('airguard_active_location') ?? '{}')).toMatchObject({
      name: 'Delhi',
    });
    await expectAxeViolations(container);
  });

  it('redirects / to /dashboard and renders the lazy dashboard inside the layout', async () => {
    localStorage.setItem('airguard_active_location', JSON.stringify(makeLocation()));
    const { container } = renderApp('/');

    await signIn();

    expect(await screen.findByTestId('page-dashboard')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(
      within(screen.getByRole('navigation')).getByRole('link', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it.each([
    ['/dashboard', 'page-dashboard'],
    ['/ai', 'page-ai'],
    ['/predictions', 'page-predictions'],
    ['/weather', 'page-weather'],
    ['/carbon', 'page-carbon'],
    ['/routines', 'page-routines'],
    ['/settings', 'page-settings'],
  ])('loads the lazy page for %s', async (path, testId) => {
    localStorage.setItem('airguard_active_location', JSON.stringify(makeLocation()));
    const { container } = renderApp(path);

    await signIn();

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(window.location.pathname).toBe(path);
    await expectAxeViolations(container);
  });

  it('redirects unmatched protected paths to the dashboard', async () => {
    localStorage.setItem('airguard_active_location', JSON.stringify(makeLocation()));
    const { container } = renderApp('/not-a-route');

    await signIn();

    expect(await screen.findByTestId('page-dashboard')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    await expectAxeViolations(container);
  });

  it('signs out from the sidebar and returns to the login page', async () => {
    const user = userEvent.setup();
    localStorage.setItem('airguard_active_location', JSON.stringify(makeLocation()));
    const { container } = renderApp('/dashboard');
    await signIn();
    await screen.findByTestId('page-dashboard');

    await user.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(mocks.appLogout).toHaveBeenCalledTimes(1));
    await signIn(null);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(mocks.clearResponseCache).toHaveBeenCalled();
    await expectAxeViolations(container);
  });

  it('signs out and redirects when an auth-error event arrives', async () => {
    localStorage.setItem('airguard_active_location', JSON.stringify(makeLocation()));
    const { container } = renderApp('/dashboard');
    await signIn();
    await screen.findByTestId('page-dashboard');

    await act(async () => {
      window.dispatchEvent(new Event('auth-error'));
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.appLogout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await expectAxeViolations(container);
  });
});
