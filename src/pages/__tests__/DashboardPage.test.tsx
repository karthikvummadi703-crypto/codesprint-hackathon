import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AirQualityData, HistoricalDataPoint } from '../../types';
import DashboardPage from '../DashboardPage';

type ActiveLocation = { name: string; latitude?: number; longitude?: number };
type Suggestion = {
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  country?: string;
  label?: string;
};

const state = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 } as ActiveLocation | null,
}));

const mocks = vi.hoisted(() => ({
  fetchAQI: vi.fn<
    (params: { lat?: number; lon?: number; city?: string; force?: boolean }) => Promise<Record<string, unknown>>
  >(),
  searchLocations: vi.fn<(query: string, limit?: number) => Promise<Suggestion[]>>(),
  reverseGeocode: vi.fn<(lat: number, lon: number) => Promise<Suggestion>>(),
  addAirQualityRecord: vi.fn<(uid: string, record: Record<string, unknown>) => Promise<void>>(),
  setLocation: vi.fn<(loc: ActiveLocation) => void>(),
}));

vi.mock('../../services/backendService', () => ({
  fetchAQI: mocks.fetchAQI,
  searchLocations: mocks.searchLocations,
  reverseGeocode: mocks.reverseGeocode,
}));

vi.mock('../../services/dataService', () => ({
  addAirQualityRecord: mocks.addAirQualityRecord,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock('../../context/LocationContext', () => ({
  useLocation: () => ({
    location: state.location,
    setLocation: mocks.setLocation,
    clearLocation: vi.fn(),
  }),
  toLocationParams: (loc: ActiveLocation) =>
    typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      ? { lat: loc.latitude, lon: loc.longitude }
      : { city: loc.name },
}));

vi.mock('../../components/LocationPicker', () => ({
  default: () => <div data-testid="location-picker">Location picker</div>,
}));

vi.mock('../../components/WeatherCard', () => ({
  default: () => <div data-testid="weather-card">Weather card</div>,
}));

vi.mock('../../components/aqi/AQIGauge', () => ({
  default: ({ aqi }: { aqi: number }) => <div>AQI gauge {aqi}</div>,
}));

vi.mock('../../components/aqi/PollutantCard', () => ({
  default: ({ pollutant }: { pollutant: { name: string } }) => <div>Pollutant {pollutant.name}</div>,
}));

vi.mock('../../components/aqi/HealthAdvisory', () => ({
  default: ({ advisory }: { advisory: string }) => <div>{advisory}</div>,
}));

vi.mock('../../components/aqi/PollutionOutlook', () => ({
  default: () => <div>Pollution outlook</div>,
}));

vi.mock('../../components/charts/AQITrendChart', () => ({
  default: ({ data }: { data: HistoricalDataPoint[] }) => (
    <div data-testid="aqi-trend-chart">AQI trend chart {data.length} points</div>
  ),
}));

vi.mock('../../components/charts/PollutantTrendChart', () => ({
  default: ({ data }: { data: HistoricalDataPoint[] }) => (
    <div data-testid="pollutant-trend-chart">Pollutant trend chart {data.length} points</div>
  ),
}));

const pollutant: AirQualityData['pollutants'][number] = {
  id: 'pm25',
  name: 'PM2.5',
  value: 42,
  unit: 'µg/m³',
  status: 'Moderate',
  description: 'Fine particulate matter.',
  safeLimit: 35,
};

const history: HistoricalDataPoint[] = [
  { time: '2026-01-01T10:00:00Z', aqi: 110, pm25: 40, pm10: 55, no2: 20, so2: 5, co: 1, o3: 18 },
  { time: '2026-01-01T11:00:00Z', aqi: 118, pm25: 42, pm10: 58, no2: 21, so2: 6, co: 1, o3: 19 },
];

const reading = {
  aqi: 118,
  status: 'Unhealthy for Sensitive Groups',
  dominantPollutant: 'PM2.5',
  healthAdvisory: 'Limit prolonged outdoor exertion.',
  location: {
    name: 'Springfield',
    latitude: 12.34,
    longitude: 56.78,
    region: 'Central',
    country: 'Testland',
  },
  pollutants: [pollutant],
  timestamp: '2026-01-01T12:00:00.000Z',
  change24h: 7,
  isEstimated: true,
  historical: history,
};

const riverCity: Suggestion = {
  name: 'River City',
  latitude: 1.5,
  longitude: 2.5,
  region: 'North',
  country: 'Testland',
  label: 'River City, Testland',
};

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

function setGeolocation(getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
}

async function expectAxeClean(container: HTMLElement, expectedViolationIds: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map((violation) => violation.id)).toEqual(expectedViolationIds);
}

function renderPage() {
  return render(<DashboardPage />);
}

beforeEach(() => {
  state.user = { uid: 'user-1' };
  state.location = { name: 'Springfield', latitude: 12.34, longitude: 56.78 };
  mocks.fetchAQI.mockReset().mockResolvedValue(reading);
  mocks.searchLocations.mockReset().mockResolvedValue([]);
  mocks.reverseGeocode.mockReset().mockResolvedValue({
    name: 'Harbor',
    latitude: 9.9,
    longitude: 10.1,
    region: 'Coast',
    country: 'Testland',
  });
  mocks.addAirQualityRecord.mockReset().mockResolvedValue(undefined);
  mocks.setLocation.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalGeolocation) {
    Object.defineProperty(navigator, 'geolocation', originalGeolocation);
  } else {
    Reflect.deleteProperty(navigator, 'geolocation');
  }
});

describe('DashboardPage', () => {
  it('renders the resolved reading and records it for the signed-in user', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('AQI gauge 118')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy for Sensitive Groups')).toBeInTheDocument();
    expect(screen.getByText(/Dominant Pollutant:/)).toHaveTextContent('PM2.5');
    expect(screen.getByText('+7 (24h)')).toBeInTheDocument();
    expect(screen.getByText('Modelled')).toBeInTheDocument();
    expect(screen.getByText('Limit prolonged outdoor exertion.')).toBeInTheDocument();
    expect(screen.getByText('Environmental Insight')).toBeInTheDocument();
    expect(screen.getByText('Pollutant Details')).toBeInTheDocument();
    expect(screen.getByText('Pollutant PM2.5')).toBeInTheDocument();
    expect(screen.getByTestId('aqi-trend-chart')).toHaveTextContent('2 points');
    expect(mocks.addAirQualityRecord).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ aqi: 118, location: 'Springfield', lat: 12.34, lon: 56.78 })
    );
    await expectAxeClean(container);
  });

  it('shows an honest loading state while the provider is pending', async () => {
    mocks.fetchAQI.mockReturnValue(new Promise<Record<string, unknown>>(() => {}));
    const { container } = renderPage();

    expect(screen.getByText('Loading reading')).toBeInTheDocument();
    expect(screen.getByText('Contacting the air quality provider.')).toBeInTheDocument();
    expect(screen.queryByText('Pollutant Details')).not.toBeInTheDocument();
    await expectAxeClean(container);
  });

  it('shows the error and empty states, then recovers through Retry', async () => {
    mocks.fetchAQI.mockRejectedValueOnce(new Error('Provider offline'));
    const { container } = renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load air quality data');
    expect(alert).toHaveTextContent('Provider offline');
    expect(screen.getByText('No reading yet')).toBeInTheDocument();
    expect(screen.getByText('Outlook unavailable')).toBeInTheDocument();

    mocks.fetchAQI.mockResolvedValueOnce(reading);
    await userEvent.click(within(alert).getByRole('button', { name: /Retry/ }));

    expect(await screen.findByText('AQI gauge 118')).toBeInTheDocument();
    expect(mocks.fetchAQI).toHaveBeenLastCalledWith(
      expect.objectContaining({ lat: 12.34, lon: 56.78, force: true })
    );
    await expectAxeClean(container);
  });

  it('renders the compact location picker when no location is pinned', async () => {
    state.location = null;
    const { container } = renderPage();

    expect(screen.getByTestId('location-picker')).toBeInTheDocument();
    expect(mocks.fetchAQI).not.toHaveBeenCalled();
    await expectAxeClean(container);
  });

  it('debounces location search and selects a suggestion with the keyboard', async () => {
    const user = userEvent.setup();
    mocks.searchLocations.mockResolvedValue([riverCity]);
    const { container } = renderPage();

    const input = screen.getByRole('combobox', { name: 'Search city or location' });
    await user.type(input, 'River');
    await waitFor(() => {
      expect(mocks.searchLocations).toHaveBeenCalledWith('River', 5);
    });

    const listbox = await screen.findByRole('listbox', { name: 'Location suggestions' });
    expect(within(listbox).getByRole('option', { name: /River City/ })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(mocks.setLocation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'River City', latitude: 1.5, longitude: 2.5 })
      );
    });
    expect(mocks.fetchAQI).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 1.5, lon: 2.5, force: false })
    );
    expect(input).toHaveAttribute('aria-activedescendant', 'dashboard-location-option-0');
    await expectAxeClean(container, ['aria-valid-attr-value']);
  });

  it('pins the typed city name when the search form is submitted without a suggestion', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.type(screen.getByRole('combobox', { name: 'Search city or location' }), 'Shimla');
    await waitFor(() => {
      expect(mocks.searchLocations).toHaveBeenCalledWith('Shimla', 5);
    });
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(mocks.setLocation).toHaveBeenCalledWith({ name: 'Shimla' });
    expect(mocks.fetchAQI).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Shimla', force: false })
    );
    await expectAxeClean(container);
  });

  it('reverse geocodes a geolocation result before loading the reading', async () => {
    setGeolocation((success) => {
      success({
        coords: { latitude: 9.9, longitude: 10.1 },
      } as unknown as GeolocationPosition);
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    await waitFor(() => {
      expect(mocks.setLocation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Harbor, Coast, Testland', latitude: 9.9, longitude: 10.1 })
      );
    });
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(9.9, 10.1);
    expect(mocks.fetchAQI).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 9.9, lon: 10.1, force: false })
    );
    await expectAxeClean(container);
  });

  it('explains a denied geolocation permission request', async () => {
    setGeolocation((_success, error) => {
      error({
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as unknown as GeolocationPositionError);
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Use my location' }));

    expect(
      await screen.findByText('Location permission denied. Enable location access or search manually.')
    ).toBeInTheDocument();
    expect(mocks.fetchAQI).not.toHaveBeenCalledWith(expect.objectContaining({ lat: 9.9 }));
    await expectAxeClean(container);
  });
});
