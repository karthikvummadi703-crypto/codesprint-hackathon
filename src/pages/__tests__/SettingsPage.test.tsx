import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import { getUser, saveUser } from '../../services/dataService';
import { fileToAvatarDataUrl } from '../../services/imageService';
import type { UserProfile } from '../../services/profileService';
import SettingsPage from '../SettingsPage';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../services/dataService', () => ({
  getUser: vi.fn(),
  saveUser: vi.fn(),
}));
vi.mock('../../services/imageService', () => ({
  fileToAvatarDataUrl: vi.fn(),
}));

type AuthValue = ReturnType<typeof useAuth>;

const expectedAxeViolationIds: string[] = [];

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

const signedInUser: NonNullable<AuthValue['user']> = {
  uid: 'user-1',
  email: 'karthik@example.com',
  name: 'Karthik Reddy',
  photoURL: null,
  isDev: false,
};

const storedProfile = {
  name: 'Stored Name',
  email: 'stored@example.com',
  location: 'Hyderabad',
  preferences: {
    units: 'imperial',
    notificationsEnabled: false,
    alertThreshold: 150,
  },
};

function mockAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  const value = createAuthValue({
    user: signedInUser,
    displayName: 'Karthik Reddy',
    avatarUrl: null,
    ...overrides,
  });
  vi.mocked(useAuth).mockReturnValue(value);
  return value;
}

async function renderLoadedPage(profile: Record<string, unknown> | null = storedProfile) {
  vi.mocked(getUser).mockResolvedValue(profile);
  const result = render(<SettingsPage />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
  return result;
}

async function expectAxeViolations(
  container: HTMLElement,
  expectedIds: string[] = expectedAxeViolationIds,
) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual(expectedIds);
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps save disabled until the profile read resolves, then shows the stored values', async () => {
    const pending = deferred<Record<string, unknown> | null>();
    vi.mocked(getUser).mockReturnValue(pending.promise);
    const { container } = render(<SettingsPage />);

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();

    await act(async () => {
      pending.resolve(storedProfile);
      await pending.promise;
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());
    expect(screen.getByLabelText('Full Name')).toHaveValue('Stored Name');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Email Address')).toHaveValue('stored@example.com');
    expect(screen.getByLabelText('Default Location')).toHaveValue('Hyderabad');
    expect(screen.getByText('SN')).toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith('user-1');
    await expectAxeViolations(container);
  });

  it('falls back to the auth display name and email when no profile exists', async () => {
    const { container } = await renderLoadedPage(null);

    expect(screen.getByLabelText('Full Name')).toHaveValue('Karthik Reddy');
    expect(screen.getByLabelText('Email Address')).toHaveValue('karthik@example.com');
    expect(screen.getByLabelText('Default Location')).toHaveValue('');
    expect(screen.getByText('KR')).toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('switches setting sections and reflects the stored preferences', async () => {
    const { container } = await renderLoadedPage();

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Preferences' }));
    expect(screen.getByRole('tab', { name: 'Preferences' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Metric (µg/m³, mg/m³)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Imperial (ppm, ppb)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Notifications' }));
    const alertSwitch = screen.getByRole('switch', { name: 'Alert Notifications' });
    expect(alertSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('slider', { name: 'Alert Threshold (AQI)' })).not.toBeInTheDocument();

    await userEvent.setup().click(alertSwitch);
    expect(alertSwitch).toHaveAttribute('aria-checked', 'true');
    const slider = screen.getByRole('slider', { name: 'Alert Threshold (AQI)' });
    expect(slider).toHaveValue('150');
    expect(slider).toHaveAttribute('aria-valuetext', '150 AQI');

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Privacy & Security' }));
    expect(
      screen.getByText(/Data is stored in your private Firestore collections/),
    ).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Profile' }));
    expect(screen.getByRole('heading', { name: 'Profile Details' })).toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('saves every edited setting, shows a saved badge and clears it after two deterministic seconds', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const auth = mockAuth();
    vi.mocked(saveUser).mockReturnValue(pending.promise);
    const { container } = await renderLoadedPage();

    const name = screen.getByLabelText('Full Name');
    const location = screen.getByLabelText('Default Location');
    await user.clear(name);
    await user.type(name, 'New Name');
    await user.clear(location);
    await user.type(location, 'Pune');
    await user.click(screen.getByRole('tab', { name: 'Preferences' }));
    await user.click(screen.getByRole('button', { name: 'Metric (µg/m³, mg/m³)' }));
    await user.click(screen.getByRole('tab', { name: 'Notifications' }));
    await user.click(screen.getByRole('switch', { name: 'Alert Notifications' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Alert Threshold (AQI)' }), {
      target: { value: '200' },
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });

    const expectedPatch = {
      name: 'New Name',
      email: 'stored@example.com',
      location: 'Pune',
      preferences: {
        units: 'metric',
        notificationsEnabled: true,
        alertThreshold: 200,
      },
      updatedAt: '2026-01-15T12:00:00.000Z',
    };
    expect(saveUser).toHaveBeenCalledWith('user-1', expectedPatch);
    expect(auth.syncProfileLocally).toHaveBeenCalledWith(expectedPatch);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }));
    vi.useRealTimers();
    await expectAxeViolations(container);
  });

  it('shows a persistence error and re-enables save when the write fails', async () => {
    vi.mocked(saveUser).mockRejectedValue(new Error('Firestore unavailable'));
    const { container } = await renderLoadedPage();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestore unavailable');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('processes an uploaded photo and updates the shared avatar', async () => {
    const dataUrl = 'data:image/jpeg;base64,AAA';
    const auth = mockAuth();
    vi.mocked(fileToAvatarDataUrl).mockResolvedValue(dataUrl);
    const { container } = await renderLoadedPage();
    const file = new File(['fake-image-bytes'], 'avatar.png', { type: 'image/png' });

    await userEvent.setup().upload(screen.getByLabelText('Upload profile photo'), file);

    expect(fileToAvatarDataUrl).toHaveBeenCalledWith(file);
    expect(auth.updateAvatar).toHaveBeenCalledWith(dataUrl);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('removes the current photo by updating the avatar to null', async () => {
    const auth = mockAuth({ avatarUrl: 'data:image/jpeg;base64,OLD' });
    const { container } = await renderLoadedPage();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }));

    expect(auth.updateAvatar).toHaveBeenCalledWith(null);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('reports an image-processing error without updating the avatar', async () => {
    const auth = mockAuth();
    vi.mocked(fileToAvatarDataUrl).mockRejectedValue(
      new Error('Could not read that image. Try a different file.'),
    );
    const { container } = await renderLoadedPage();

    await userEvent
      .setup()
      .upload(
        screen.getByLabelText('Upload profile photo'),
        new File(['fake-image-bytes'], 'avatar.png', { type: 'image/png' }),
      );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read that image. Try a different file.',
    );
    expect(auth.updateAvatar).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });

  it('reports an avatar-update error when removing the photo fails', async () => {
    const auth = mockAuth({
      avatarUrl: 'data:image/jpeg;base64,OLD',
      updateAvatar: vi
        .fn<(photoURL: string | null) => Promise<void>>()
        .mockRejectedValue(new Error('Permission denied')),
    });
    const { container } = await renderLoadedPage();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(auth.updateAvatar).toHaveBeenCalledWith(null);
    expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();
    await expectAxeViolations(container);
  });
});
