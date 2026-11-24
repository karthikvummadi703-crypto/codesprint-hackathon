import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RoutinesPage from '../RoutinesPage';
import { useAuth } from '../../context/AuthContext';
import { useLocation, type ActiveLocation } from '../../context/LocationContext';
import { fetchAQI, searchLocations, type PlaceSuggestion } from '../../services/backendService';
import { getLifestyleSettings, saveLifestyleSettings } from '../../services/dataService';
import type { AppUser } from '../../services/authService';
import type { AqiApiResponse, Json } from '../../types';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  fetchAQI: vi.fn(),
  searchLocations: vi.fn(),
  getLifestyleSettings: vi.fn(),
  saveLifestyleSettings: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/LocationContext', async () => {
  const actual = await vi.importActual<typeof import('../../context/LocationContext')>(
    '../../context/LocationContext',
  );
  return { ...actual, useLocation: vi.fn() };
});
vi.mock('../../services/backendService', () => ({
  fetchAQI: mocks.fetchAQI,
  searchLocations: mocks.searchLocations,
}));
vi.mock('../../services/dataService', () => ({
  getLifestyleSettings: mocks.getLifestyleSettings,
  saveLifestyleSettings: mocks.saveLifestyleSettings,
}));

const testUser: AppUser = {
  uid: 'user-1',
  email: 'household@example.com',
  name: 'Household',
  photoURL: null,
  isDev: true,
};

const pinnedLocation: ActiveLocation = {
  name: 'Delhi',
  latitude: 28.6,
  longitude: 77.2,
};

const mainReading: AqiApiResponse = {
  aqi: 42,
  status: 'Good',
  dominantPollutant: 'PM2.5',
  healthAdvisory: 'Outdoor activities are fine.',
  pollutants: [],
  timestamp: '2026-11-24T09:00:00.000Z',
};

const schoolReading: AqiApiResponse = {
  ...mainReading,
  aqi: 78,
  status: 'Moderate',
  location: { name: 'City Library' },
};

const librarySuggestion: PlaceSuggestion = {
  name: 'City Library',
  label: 'City Library, Delhi',
  latitude: 28.7,
  longitude: 77.3,
  region: 'Delhi',
  country: 'India',
};

const savedSettings = {
  household: {
    members: [{ id: 'member-1', name: 'Riya', kind: 'child' }],
  },
  communityWatch: [
    { id: 'place-1', name: 'School', latitude: 28.7, longitude: 77.3, label: 'School, Delhi' },
  ],
} satisfies Json;

function authValue(user: AppUser | null): ReturnType<typeof useAuth> {
  return {
    user,
    displayName: user?.name ?? '',
    avatarUrl: null,
    profile: null,
    profileLoading: false,
    initializing: false,
    signup: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    loginWithGoogle: vi.fn(async () => false),
    resetPassword: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    updateName: vi.fn(async () => undefined),
    updateAvatar: vi.fn(async () => undefined),
    syncProfileLocally: vi.fn(),
  };
}

function locationValue(location: ActiveLocation | null): ReturnType<typeof useLocation> {
  return { location, setLocation: mocks.setLocation, clearLocation: vi.fn() };
}

async function expectZeroViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T09:00:00.000Z'));
  vi.mocked(useAuth).mockReturnValue(authValue(testUser));
  vi.mocked(useLocation).mockReturnValue(locationValue(pinnedLocation));
  vi.mocked(getLifestyleSettings).mockResolvedValue(null);
  vi.mocked(fetchAQI).mockImplementation(async (params) =>
    params.lat === librarySuggestion.latitude ? schoolReading : mainReading,
  );
  vi.mocked(searchLocations).mockResolvedValue([librarySuggestion]);
  vi.mocked(saveLifestyleSettings).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RoutinesPage', () => {
  it('shows the no-reading fallback and winter badge while AQI is loading', async () => {
    vi.mocked(fetchAQI).mockImplementation(() => new Promise<AqiApiResponse>(() => undefined));
    const { container } = render(<RoutinesPage />);

    expect(screen.getByRole('heading', { name: /Daily Routines for Your Household/ })).toBeInTheDocument();
    expect(screen.getByText('Winter smog season')).toBeInTheDocument();
    expect(
      screen.getByText(
        /No live reading is available for Delhi\. General, season-aware habits are shown below/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/routines are available to the AI assistant/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Indoor air quality/ })).toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('renders the live AQI, saved household, community place and tailored routines', async () => {
    vi.mocked(getLifestyleSettings).mockResolvedValue(savedSettings);
    const { container } = render(<RoutinesPage />);

    await waitFor(() => {
      expect(screen.getByText(/with sensitive household members in mind/)).toBeInTheDocument();
    });
    expect(screen.getByText('AQI 42')).toBeInTheDocument();
    expect(screen.getByText('Riya')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(screen.getByText(/Your plan includes extra protection for sensitive members/)).toBeInTheDocument();
    expect(screen.getByText('School, Delhi')).toBeInTheDocument();
    expect(await screen.findByText('AQI 78')).toBeInTheDocument();
    expect(screen.getByText('Time your window opening')).toBeInTheDocument();
    expect(screen.getByText('Carry a well-fitting mask for unavoidable outdoor time')).toBeInTheDocument();
    expect(screen.getByText('Check in with sensitive household members')).toBeInTheDocument();
    expect(
      screen.getByText('11 routines are available to the AI assistant when you ask about daily habits.'),
    ).toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('falls back to general guidance when the AQI request fails', async () => {
    vi.mocked(fetchAQI).mockRejectedValue(new Error('Backend offline'));
    const { container } = render(<RoutinesPage />);

    await waitFor(() => {
      expect(fetchAQI).toHaveBeenCalledWith({ lat: 28.6, lon: 77.2 });
    });
    expect(screen.getByText(/No live reading is available for Delhi\./)).toBeInTheDocument();
    expect(screen.queryByText(/Based on AQI/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('adds a sensitive household member and updates the plan', async () => {
    const user = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    await user.type(screen.getByLabelText('Name'), 'Arjun');
    await user.selectOptions(screen.getByLabelText('Needs'), 'respiratory');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(screen.getByText('Arjun')).toBeInTheDocument();
    expect(screen.getByText('respiratory')).toBeInTheDocument();
    expect(screen.getByText(/Your plan includes extra protection for sensitive members/)).toBeInTheDocument();
    expect(screen.getByText('Check in with sensitive household members')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    await expectZeroViolations(container);
  });

  it('adds and removes a community place from search suggestions', async () => {
    const user = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    expect(screen.getByText('No places saved yet.')).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: 'Search a community place' }), 'Library');

    const suggestion = await screen.findByRole('option', { name: 'City Library, Delhi' });
    expect(searchLocations).toHaveBeenCalledWith('Library', 5);
    await user.click(suggestion);

    expect(screen.getByText('City Library, Delhi')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search a community place' })).toHaveValue('');
    expect(await screen.findByText('AQI 78')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove City Library from community watch' }));
    expect(screen.getByText('No places saved yet.')).toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('saves the household and community watch and shows the saved badge', async () => {
    const user = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    await user.click(screen.getByRole('button', { name: 'Save household & community watch' }));

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
    expect(saveLifestyleSettings).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ household: { members: [] }, communityWatch: [] }),
    );
    await expectZeroViolations(container);
  });

  it('reports a save failure in an alert and does not show the saved badge', async () => {
    vi.mocked(saveLifestyleSettings).mockRejectedValue(new Error('Firestore unavailable'));
    const user = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    await user.click(screen.getByRole('button', { name: 'Save household & community watch' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Firestore unavailable');
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save household & community watch' })).toBeEnabled();
    await expectZeroViolations(container);
  });
});
