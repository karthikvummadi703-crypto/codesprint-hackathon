import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsPage from '../SettingsPage';
import type { useAuth as useAuthType } from '../../context/AuthContext';

type AuthValue = ReturnType<typeof useAuthType>;

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getUser: vi.fn(),
  saveUser: vi.fn(),
  initialsFor: vi.fn(),
  fileToAvatarDataUrl: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../services/dataService', () => ({ getUser: mocks.getUser, saveUser: mocks.saveUser }));
vi.mock('../../services/profileService', () => ({ initialsFor: mocks.initialsFor }));
vi.mock('../../services/imageService', () => ({ fileToAvatarDataUrl: mocks.fileToAvatarDataUrl }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    user: { uid: 'u1', email: 'ada@example.com', name: 'Ada Lovelace', photoURL: null, isDev: false },
    displayName: 'Ada Lovelace',
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
  mocks.getUser.mockResolvedValue(null);
  mocks.saveUser.mockResolvedValue(undefined);
  mocks.initialsFor.mockImplementation((value: string) => value.slice(0, 2).toUpperCase());
  mocks.fileToAvatarDataUrl.mockResolvedValue('data:image/jpeg;base64,AAAA');
});

describe('SettingsPage', () => {
  it('disables the form until the stored profile loads, then hydrates the fields', async () => {
    const pending = deferred<Record<string, unknown> | null>();
    mocks.getUser.mockReturnValue(pending.promise);

    const { container } = render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect((await axe(container)).violations).toEqual([]);

    await act(async () => {
      pending.resolve({
        name: 'Ada L.',
        email: 'ada@example.com',
        location: 'London',
        preferences: { units: 'imperial', notificationsEnabled: false, alertThreshold: 150 },
      });
    });

    expect(mocks.getUser).toHaveBeenCalledWith('u1');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Full Name' })).toHaveValue('Ada L.');
    expect(screen.getByRole('textbox', { name: 'Email Address' })).toHaveValue('ada@example.com');
    expect(screen.getByRole('textbox', { name: 'Default Location' })).toHaveValue('London');
    expect(mocks.initialsFor).toHaveBeenCalledWith('Ada L.');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('falls back to auth details when the stored profile is empty', async () => {
    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());

    expect(screen.getByRole('textbox', { name: 'Full Name' })).toHaveValue('Ada Lovelace');
    expect(screen.getByRole('textbox', { name: 'Email Address' })).toHaveValue('ada@example.com');
    expect(screen.getByRole('textbox', { name: 'Default Location' })).toHaveValue('');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('leaves the form usable after a profile read failure', async () => {
    mocks.getUser.mockRejectedValue(new Error('read failed'));

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());

    expect(screen.getByRole('textbox', { name: 'Full Name' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Email Address' })).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('saves edited profile and preference values and confirms success', async () => {
    const syncProfileLocally = vi.fn();
    mocks.useAuth.mockReturnValue(makeAuth({ syncProfileLocally }));
    mocks.getUser.mockResolvedValue({ name: 'Ada', email: 'ada@example.com', location: 'London' });
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());

    await user.clear(screen.getByRole('textbox', { name: 'Full Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Full Name' }), 'Grace Hopper');
    await user.clear(screen.getByRole('textbox', { name: 'Default Location' }));
    await user.type(screen.getByRole('textbox', { name: 'Default Location' }), 'New York');

    await user.click(screen.getByRole('tab', { name: 'Preferences' }));
    await user.click(screen.getByRole('button', { name: 'Imperial (ppm, ppb)' }));
    expect(screen.getByRole('button', { name: 'Imperial (ppm, ppb)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Notifications' }));
    await user.click(screen.getByRole('switch', { name: 'Alert Notifications' }));
    expect(screen.getByRole('switch', { name: 'Alert Notifications' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.queryByRole('slider', { name: 'Alert Threshold (AQI)' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mocks.saveUser).toHaveBeenCalledTimes(1));
    expect(mocks.saveUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        name: 'Grace Hopper',
        email: 'ada@example.com',
        location: 'New York',
        preferences: { units: 'imperial', notificationsEnabled: false, alertThreshold: 100 },
        updatedAt: expect.any(String),
      }),
    );
    expect(syncProfileLocally).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Grace Hopper', location: 'New York' }),
    );
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('adapts the alert threshold from the slider and keeps it visible while enabled', async () => {
    mocks.getUser.mockResolvedValue({
      name: 'Ada',
      email: 'ada@example.com',
      location: 'London',
      preferences: { units: 'metric', notificationsEnabled: true, alertThreshold: 100 },
    });
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());
    await user.click(screen.getByRole('tab', { name: 'Notifications' }));

    const slider = screen.getByRole('slider', { name: 'Alert Threshold (AQI)' });
    expect(slider).toHaveValue('100');
    fireEvent.change(slider, { target: { value: '150' } });
    expect(screen.getByText('150 AQI')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.saveUser).toHaveBeenCalledTimes(1));
    expect(mocks.saveUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ preferences: expect.objectContaining({ alertThreshold: 150 }) }),
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a save failure as an alert and re-enables the submit button', async () => {
    mocks.saveUser.mockRejectedValue(new Error('Quota exceeded'));
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());
    await user.type(screen.getByRole('textbox', { name: 'Default Location' }), 'London');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Quota exceeded');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('navigates settings tabs with arrow, Home and End keys', async () => {
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());

    const profileTab = screen.getByRole('tab', { name: 'Profile' });
    await user.click(profileTab);
    expect(profileTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    const preferencesTab = screen.getByRole('tab', { name: 'Preferences' });
    expect(preferencesTab).toHaveAttribute('aria-selected', 'true');
    expect(preferencesTab).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Privacy & Security' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(profileTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Privacy & Security' })).toHaveAttribute('aria-selected', 'true');

    expect((await axe(container)).violations).toEqual([]);
  });

  it('uploads a selected avatar and clears the file input for re-selection', async () => {
    const updateAvatar = vi.fn(async () => {});
    mocks.useAuth.mockReturnValue(makeAuth({ updateAvatar }));
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled());
    const input = screen.getByLabelText('Upload profile photo');
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    await user.upload(input, file);

    expect(mocks.fileToAvatarDataUrl).toHaveBeenCalledWith(file);
    await waitFor(() => expect(updateAvatar).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA'));
    expect(input).toHaveValue('');
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('removes an existing avatar', async () => {
    const updateAvatar = vi.fn(async () => {});
    mocks.useAuth.mockReturnValue(makeAuth({ avatarUrl: 'data:image/png;base64,OLD', updateAvatar }));
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(updateAvatar).toHaveBeenCalledWith(null);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('reports an avatar processing failure in an alert', async () => {
    mocks.fileToAvatarDataUrl.mockRejectedValue(new Error('Bad image'));
    const user = userEvent.setup();

    const { container } = render(<SettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled());
    await user.upload(
      screen.getByLabelText('Upload profile photo'),
      new File(['x'], 'x.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Bad image');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect((await axe(container)).violations).toEqual([]);
  });
});
