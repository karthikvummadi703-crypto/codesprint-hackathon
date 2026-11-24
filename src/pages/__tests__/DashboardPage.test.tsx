import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from '../DashboardPage';
import { useAuth } from '../../context/AuthContext';
import { useLocation, type ActiveLocation } from '../../context/LocationContext';
import {
  fetchAQI,
  reverseGeocode,
  searchLocations,
  type PlaceSuggestion,
} from '../../services/backendService';
import { addAirQualityRecord } from '../../services/dataService';
import type { AppUser } from '../../services/authService';
import type { AqiApiResponse } from '../../types';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  fetchAQI: vi.fn(),
  searchLocations: vi.fn(),
  reverseGeocode: vi.fn(),
  addAirQualityRecord: vi.fn(),
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
  reverseGeocode: mocks.reverseGeocode,
}));
vi.mock('../../services/dataService', () => ({ addAirQualityRecord: mocks.addAirQualityRecord }));
vi.mock('../../components/WeatherCard', () => ({
  default: ({ params }: { params: { lat?: number; lon?: number; city?: string } }) => (
    <div data-testid="weather-card">{params.city ?? `${params.lat},${params.lon}`}</div>
  ),
}));
vi.mock('../../components/aqi/PollutionOutlook', () => ({
  default: ({ location }: { location: { name: string } }) => (
    <div data-testid="pollution-outlook">{location.name}</div>
  ),
}));
vi.mock('../../components/charts/AQITrendChart', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="aqi-trend">{`${data.length} history points`}</div>
  ),
}));
vi.mock('../../components/charts/PollutantTrendChart', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="pollutant-trend">{`${data.length} history points`}</div>
  ),
}));

const testUser: AppUser = {
  uid: 'user-1',
  email: 'reader@example.com',
  name: 'Reader',
  photoURL: null,
  isDev: true,
};

const pinnedLocation: ActiveLocation = {
  name: 'Delhi',
  latitude: 28.6,
  longitude: 77.2,
  region: 'Delhi',
  country: 'India',
};

const place: PlaceSuggestion = {
  name: 'Pune',
  label: 'Pune, Maharashtra, India',
  latitude: 18.52,
  longitude: 73.86,
  region: 'Maharashtra',
  country: 'India',
};

const aqiResponse: AqiApiResponse = {
  aqi: 42,
  status: 'Good',
  dominantPollutant: 'PM2.5',
  healthAdvisory: 'Air quality is good; outdoor activities are fine.',
  location: {
    name: 'Connaught Place',
    latitude: 28.6315,
    longitude: 77.2167,
    region: 'Delhi',
    country: 'India',
  },
  pollutants: [
    {
      id: 'pm25',
      name: 'PM2.5',
      value: 12,
      unit: 'µg/m³',
      status: 'Good',
      description: 'Fine particles from traffic and combustion.',
      safeLimit: 35,
    },
  ],
  timestamp: '2026-11-24T06:00:00.000Z',
  change24h: 3,
  historical: [{ time: '06:00', aqi: 40, pm25: 10, pm10: 20, no2: 5, so2: 2, co: 1, o3: 8 }],
  isEstimated: true,
};

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

function fullPosition(): GeolocationPosition {
  return {
    coords: {
      latitude: 28.75,
      longitude: 77.5,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({ latitude: 28.75, longitude: 77.5 }),
    },
    timestamp: 0,
    toJSON: () => ({ coords: { latitude: 28.75, longitude: 77.5 }, timestamp: 0 }),
  };
}

function permissionDenied(): GeolocationPositionError {
  return {
    code: 1,
    message: 'Denied',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

async function expectZeroViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue(authValue(testUser));
  vi.mocked(useLocation).mockReturnValue(locationValue(pinnedLocation));
  vi.mocked(fetchAQI).mockResolvedValue(aqiResponse);
  vi.mocked(searchLocations).mockResolvedValue([]);
  vi.mocked(reverseGeocode).mockResolvedValue({
    name: 'Noida',
    region: 'Uttar Pradesh',
    country: 'India',
    latitude: 28.75,
    longitude: 77.5,
  });
  vi.mocked(addAirQualityRecord).mockResolvedValue(undefined);
  if (originalGeolocation) {
    Object.defineProperty(navigator, 'geolocation', originalGeolocation);
  } else {
    Reflect.deleteProperty(navigator, 'geolocation');
  }
});

describe('DashboardPage', () => {
  it('shows the loading state while the provider is contacted', async () => {
    vi.mocked(fetchAQI).mockImplementation(() => new Promise<AqiApiResponse>(() => undefined));
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(fetchAQI).toHaveBeenCalledWith({ lat: 28.6, lon: 77.2, force: false });
    });
    expect(screen.getByText('Loading reading')).toBeInTheDocument();
    expect(screen.getByText('Contacting the air quality provider.')).toBeInTheDocument();
    expect(screen.getByText('Outlook unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Air Quality Index/ })).not.toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('renders the reading, pollutants, history and estimated badge on success', async () => {
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Air Quality Index: 42' })).toBeInTheDocument();
    });
    expect(screen.getAllByText('Good')).toHaveLength(2);
    expect(screen.getByText(/Dominant Pollutant:/)).toHaveTextContent('PM2.5');
    expect(screen.getByText(/Air quality is good; outdoor activities are fine./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pollutant Details' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'PM2.5 level' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Environmental Insight' })).toBeInTheDocument();
    expect(screen.getByText('Modelled')).toBeInTheDocument();
    expect(screen.getByTestId('weather-card')).toHaveTextContent('28.6,77.2');
    expect(screen.getByTestId('pollution-outlook')).toHaveTextContent('Connaught Place');
    expect(screen.getByTestId('aqi-trend')).toHaveTextContent('1 history points');
    expect(mocks.setLocation).toHaveBeenCalledWith({
      name: 'Connaught Place',
      latitude: 28.6315,
      longitude: 77.2167,
      region: 'Delhi',
      country: 'India',
    });
    expect(addAirQualityRecord).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        aqi: 42,
        location: 'Connaught Place',
        timestamp: '2026-11-24T06:00:00.000Z',
      }),
    );
    await expectZeroViolations(container);
  });

  it('shows an error with no stale reading, then retries with force', async () => {
    vi.mocked(fetchAQI)
      .mockRejectedValueOnce(new Error('Provider offline'))
      .mockResolvedValueOnce(aqiResponse);
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load air quality data');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Provider offline');
    expect(screen.getByText('No reading yet')).toBeInTheDocument();
    expect(screen.getByText('Outlook unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Air Quality Index/ })).not.toBeInTheDocument();
    await expectZeroViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Air Quality Index: 42' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchAQI).toHaveBeenNthCalledWith(2, { lat: 28.6, lon: 77.2, force: true });
    await expectZeroViolations(container);
  });

  it('pins a location selected from the search suggestions', async () => {
    vi.mocked(fetchAQI).mockResolvedValue({
      ...aqiResponse,
      location: { ...aqiResponse.location, name: 'Pune' },
    });
    vi.mocked(searchLocations).mockResolvedValue([place]);
    const user = userEvent.setup();
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Air Quality Index: 42' })).toBeInTheDocument();
    });
    await user.type(screen.getByRole('combobox', { name: 'Search city or location' }), 'Pune');

    expect(await screen.findByText('Searching locations...')).toBeInTheDocument();
    const option = await screen.findByRole('option', { name: /Pune/ });
    expect(screen.getByRole('listbox', { name: 'Location suggestions' })).toBeInTheDocument();
    await user.click(option);

    await waitFor(() => {
      expect(fetchAQI).toHaveBeenLastCalledWith({ lat: 18.52, lon: 73.86, force: false });
    });
    expect(mocks.setLocation).toHaveBeenCalledWith({
      name: 'Pune',
      latitude: 18.52,
      longitude: 73.86,
      region: 'Maharashtra',
      country: 'India',
    });
    await waitFor(() => {
      expect(screen.getByText('Pune', { selector: 'span' })).toBeInTheDocument();
    });
    await expectZeroViolations(container);
  });

  it('uses the browser location and its reverse-geocoded label', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success(fullPosition())),
        watchPosition: vi.fn(() => 0),
        clearWatch: vi.fn(),
      } satisfies Pick<Geolocation, 'getCurrentPosition' | 'watchPosition' | 'clearWatch'>,
    });
    vi.mocked(fetchAQI).mockResolvedValue({
      ...aqiResponse,
      location: { ...aqiResponse.location, name: 'Noida, Uttar Pradesh, India' },
    });
    const user = userEvent.setup();
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Air Quality Index: 42' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    await waitFor(() => {
      expect(reverseGeocode).toHaveBeenCalledWith(28.75, 77.5);
    });
    expect(mocks.setLocation).toHaveBeenCalledWith({
      name: 'Noida, Uttar Pradesh, India',
      latitude: 28.75,
      longitude: 77.5,
    });
    await waitFor(() => {
      expect(fetchAQI).toHaveBeenLastCalledWith({ lat: 28.75, lon: 77.5, force: false });
    });
    expect(screen.getByText('Noida, Uttar Pradesh, India', { selector: 'span' })).toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('reports a location permission denial without starting a fetch', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, onError?: PositionErrorCallback | null) =>
          onError?.(permissionDenied()),
        ),
        watchPosition: vi.fn(() => 0),
        clearWatch: vi.fn(),
      } satisfies Pick<Geolocation, 'getCurrentPosition' | 'watchPosition' | 'clearWatch'>,
    });
    const user = userEvent.setup();
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Air Quality Index: 42' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Location permission denied. Enable location access or search manually.',
      );
    });
    expect(fetchAQI).toHaveBeenCalledTimes(1);
    await expectZeroViolations(container);
  });
});
