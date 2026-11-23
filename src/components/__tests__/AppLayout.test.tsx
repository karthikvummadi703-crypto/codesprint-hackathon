import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppLayout from '../layout/AppLayout';

const mocks = vi.hoisted(() => ({ logout: vi.fn<() => Promise<void>>() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'karthik@example.com' },
    displayName: 'Karthik V',
    avatarUrl: null,
    profileLoading: false,
    logout: mocks.logout,
  }),
}));

vi.mock('../../services/profileService', () => ({
  initialsFor: (name: string) =>
    name
      .split(/\s+/)
      .map(part => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase(),
}));

function renderLayout(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route path="dashboard" element={<div>Dashboard content</div>} />
          <Route path="predictions" element={<div>Predictions content</div>} />
          <Route path="login" element={<div>Login content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    mocks.logout.mockReset().mockResolvedValue(undefined);
  });

  it('renders the skip link, desktop navigation and Outlet content with no axe violations', async () => {
    const { container } = renderLayout();

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('karthik@example.com')).toBeInTheDocument();
    expect(screen.getByText('KV')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('opens the mobile navigation dialog and has no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('link', { name: 'Predictions' })).toHaveAttribute(
      'href',
      '/predictions',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Close navigation menu' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close navigation menu' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    const results = await axe(container);
    expect(results.violations.map(violation => violation.id)).toEqual(['landmark-unique']);
  });

  it('closes the dialog on Escape', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the dialog when the overlay button is clicked', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const closeButtons = screen.getAllByRole('button', { name: 'Close navigation menu' });
    await user.click(closeButtons[0]!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the dialog from the Sidebar close control', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    await user.click(within(dialog).getByRole('button', { name: 'Close navigation menu' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates and closes the dialog when a nav link is clicked', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Navigation menu' });
    await user.click(within(dialog).getByRole('link', { name: 'Predictions' }));

    expect(screen.getByText('Predictions content')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls logout and navigates to the login outlet', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Login content')).toBeInTheDocument());
  });
});
