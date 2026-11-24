import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, Route, Routes, useLocation as useRouterLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../AppLayout';

const mocks = vi.hoisted(() => ({
  logout: vi.fn<() => Promise<void>>(),
  auth: {
    displayName: 'Test User',
    avatarUrl: null as string | null,
    profileLoading: false,
  },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com' },
    displayName: mocks.auth.displayName,
    avatarUrl: mocks.auth.avatarUrl,
    profileLoading: mocks.auth.profileLoading,
    logout: mocks.logout,
  }),
}));

vi.mock('../../../services/profileService', () => ({
  initialsFor: (name: string) => name.slice(0, 2).toUpperCase(),
}));

function LocationProbe() {
  const routerLocation = useRouterLocation();
  return <span data-testid="route-path">{routerLocation.pathname}</span>;
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <LocationProbe />
      <Routes>
        <Route path="/dashboard" element={<AppLayout />}>
          <Route index element={<p>Outlet content</p>} />
        </Route>
        <Route path="/settings" element={<p>Settings page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openMobileMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

beforeEach(() => {
  mocks.logout.mockReset();
  mocks.logout.mockResolvedValue(undefined);
  mocks.auth.displayName = 'Test User';
  mocks.auth.avatarUrl = null;
  mocks.auth.profileLoading = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppLayout', () => {
  it('renders the desktop shell, skip link and outlet content', async () => {
    const { container } = renderLayout();

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByText('Outlet content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'AI Assistant' })).toHaveAttribute('href', '/ai');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('opens the mobile navigation dialog with all links', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await openMobileMenu(user);

    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('id', 'mobile-navigation');
    expect(within(dialog).getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-controls',
      'mobile-navigation',
    );
    expect(screen.getAllByRole('button', { name: 'Close navigation menu' })).toHaveLength(2);

    expect(
      (
        await axe(container, {
          rules: { 'landmark-unique': { enabled: false } },
        })
      ).violations,
    ).toEqual([]);
  });

  it('closes the mobile navigation with Escape', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await openMobileMenu(user);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await expectAccessible(container);
  });

  it('closes the mobile navigation from the backdrop button', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await openMobileMenu(user);
    const closeButtons = screen.getAllByRole('button', { name: 'Close navigation menu' });
    const backdrop = closeButtons[0];
    expect(backdrop).toBeDefined();
    if (!backdrop) throw new Error('Backdrop button was not rendered');

    await user.click(backdrop);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('closes the mobile navigation after a link is chosen', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await openMobileMenu(user);
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    await user.click(within(dialog).getByRole('link', { name: 'Settings' }));

    expect(screen.getByTestId('route-path')).toHaveTextContent('/settings');
    expect(screen.getByText('Settings page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('logs out and navigates to the login page', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('route-path')).toHaveTextContent('/login');

    await expectAccessible(container);
  });

  it('hides the display name until the profile has loaded', async () => {
    mocks.auth.profileLoading = true;
    const { container } = renderLayout();

    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();

    await expectAccessible(container);
  });

  it('renders the profile avatar when one is available', async () => {
    mocks.auth.avatarUrl = 'https://example.test/avatar.png';
    const { container } = renderLayout();

    const avatar = container.querySelector('img');
    expect(avatar).toHaveAttribute('src', 'https://example.test/avatar.png');
    expect(avatar).toHaveAttribute('alt', '');
    expect(screen.getByText('Test User')).toBeInTheDocument();

    await expectAccessible(container);
  });
});
