import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import type { ActiveLocation } from './context/LocationContext';
import type { AppUser } from './services/authService';

const mocks = vi.hoisted(() => ({
  user: null as AppUser | null,
  initializing: false,
  location: null as ActiveLocation | null,
  setLocation: vi.fn<(loc: ActiveLocation) => void>(),
  clearLocation: vi.fn<() => void>(),
  page:
    (
      h: typeof import('react').createElement,
      label: string,
      wrapper: 'main' | 'section',
      heading: 'h1' | 'h2',
    ) =>
    () =>
      h(wrapper, null, h(heading, null, label)),
}));

vi.mock('./context/AuthContext', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    AuthProvider: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
    useAuth: () => ({ user: mocks.user, initializing: mocks.initializing }),
  };
});

vi.mock('./context/LocationContext', () => ({
  LocationProvider: ({ children }: { children: ReactNode }) => children,
  useLocation: () => ({
    location: mocks.location,
    setLocation: mocks.setLocation,
    clearLocation: mocks.clearLocation,
  }),
}));

vi.mock('./components/LocationPicker', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Choose a location', 'main', 'h1') };
});

vi.mock('./components/layout/AppLayout', async () => {
  const { createElement } = await import('react');
  const { Link, Outlet, useLocation } = await import('react-router-dom');
  function AppLayoutStub() {
    const routerLocation = useLocation();
    return createElement(
      'div',
      null,
      createElement('h1', null, 'Protected layout'),
      createElement('p', { 'data-testid': 'route-path' }, routerLocation.pathname),
      createElement(Link, { to: '/settings' }, 'Open settings'),
      createElement(Outlet),
    );
  }
  return { default: AppLayoutStub };
});

vi.mock('./pages/LoginPage', async () => {
  const { createElement } = await import('react');
  const { useNavigate } = await import('react-router-dom');
  function LoginPageStub() {
    const navigate = useNavigate();
    return createElement(
      'main',
      null,
      createElement('h1', null, 'Login page'),
      createElement('button', { type: 'button', onClick: () => navigate('/signup') }, 'Go to sign up'),
    );
  }
  return { default: LoginPageStub };
});

vi.mock('./pages/SignupPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Sign up page', 'main', 'h1') };
});

vi.mock('./pages/ForgotPasswordPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Forgot password page', 'main', 'h1') };
});

vi.mock('./pages/DashboardPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Dashboard page', 'section', 'h2') };
});

vi.mock('./pages/AIAssistantPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'AI Assistant page', 'section', 'h2') };
});

vi.mock('./pages/PredictionsPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Predictions page', 'section', 'h2') };
});

vi.mock('./pages/WeatherReportPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Weather report page', 'section', 'h2') };
});

vi.mock('./pages/CarbonFootprintPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Carbon footprint page', 'section', 'h2') };
});

vi.mock('./pages/RoutinesPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Routines page', 'section', 'h2') };
});

vi.mock('./pages/SettingsPage', async () => {
  const { createElement } = await import('react');
  return { default: mocks.page(createElement, 'Settings page', 'section', 'h2') };
});

const signedIn: AppUser = {
  uid: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  photoURL: null,
  isDev: false,
};
const pinned: ActiveLocation = { name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 };

function renderApp(path: string) {
  window.history.replaceState({}, '', path);
  return render(<App />);
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

beforeEach(() => {
  mocks.user = null;
  mocks.initializing = false;
  mocks.location = null;
  mocks.setLocation.mockClear();
  mocks.clearLocation.mockClear();
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('App', () => {
  it('renders the login page for a signed-out visitor', async () => {
    const { container } = renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');

    await expectAccessible(container);
  });

  it('renders nothing on public routes while the auth state is initializing', async () => {
    mocks.initializing = true;
    const { container } = renderApp('/login');

    expect(screen.queryByRole('heading', { name: 'Login page' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');

    await expectAccessible(container);
  });

  it('navigates from login to signup with user-event', async () => {
    const user = userEvent.setup();
    const { container } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: 'Go to sign up' }));

    expect(await screen.findByRole('heading', { name: 'Sign up page' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/signup'));

    await expectAccessible(container);
  });

  it.each([
    ['/signup', 'Sign up page'],
    ['/forgot-password', 'Forgot password page'],
  ])('renders the public route %s', async (path, heading) => {
    const { container } = renderApp(path);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);

    await expectAccessible(container);
  });

  it('redirects a signed-in visitor from a public route to the dashboard', async () => {
    mocks.user = signedIn;
    mocks.location = pinned;
    const { container } = renderApp('/login');

    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
    expect(screen.getByTestId('route-path')).toHaveTextContent('/dashboard');

    await expectAccessible(container);
  });

  it('shows the auth loading screen on protected routes while initializing', async () => {
    mocks.initializing = true;
    const { container } = renderApp('/dashboard');

    expect(screen.getByText('Loading AirGuard AI…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Protected layout' })).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('redirects a signed-out visitor from a protected route to login', async () => {
    const { container } = renderApp('/settings');

    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));

    await expectAccessible(container);
  });

  it('redirects the index route to the dashboard', async () => {
    mocks.user = signedIn;
    mocks.location = pinned;
    const { container } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));

    await expectAccessible(container);
  });

  it('asks for a location before rendering the protected layout', async () => {
    mocks.user = signedIn;
    const { container } = renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Choose a location' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Protected layout' })).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it.each([
    ['/dashboard', 'Dashboard page'],
    ['/ai', 'AI Assistant page'],
    ['/predictions', 'Predictions page'],
    ['/weather', 'Weather report page'],
    ['/carbon', 'Carbon footprint page'],
    ['/routines', 'Routines page'],
    ['/settings', 'Settings page'],
  ])('renders the protected route %s inside the layout', async (path, heading) => {
    mocks.user = signedIn;
    mocks.location = pinned;
    const { container } = renderApp(path);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protected layout' })).toBeInTheDocument();
    expect(screen.getByTestId('route-path')).toHaveTextContent(path);

    await expectAccessible(container);
  });

  it('redirects an unknown protected path to the dashboard', async () => {
    mocks.user = signedIn;
    mocks.location = pinned;
    const { container } = renderApp('/no-such-page');

    expect(await screen.findByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));

    await expectAccessible(container);
  });
});
