import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocationProvider, toLocationParams, useLocation } from '../LocationContext';
import type { ActiveLocation } from '../LocationContext';
import type { PlaceSuggestion } from '../../services/backendService';
import LocationPicker from '../../components/LocationPicker';

const STORAGE_KEY = 'airguard_active_location';

type PositionSuccess = (position: GeolocationPosition) => void;
type PositionFailure = (error: GeolocationPositionError) => void;

const mocks = vi.hoisted(() => ({
  searchLocations: vi.fn(),
  reverseGeocode: vi.fn(),
  getCurrentPosition: vi.fn<(success: PositionSuccess, failure: PositionFailure, options?: PositionOptions) => void>(),
}));

vi.mock('../../services/backendService', () => ({
  searchLocations: mocks.searchLocations,
  reverseGeocode: mocks.reverseGeocode,
}));

const observed = {
  renders: 0,
  setLocation: null as null | ((location: ActiveLocation) => void),
  clearLocation: null as null | (() => void),
};

function delhi(): ActiveLocation {
  return { name: 'Delhi', latitude: 28.6139, longitude: 77.209, region: 'Delhi', country: 'India' };
}

function suggestion(): PlaceSuggestion {
  return {
    name: 'Delhi',
    latitude: 28.6139,
    longitude: 77.209,
    region: 'Delhi',
    country: 'India',
    label: 'Delhi, India',
  };
}

function LocationProbe() {
  const { location, setLocation, clearLocation } = useLocation();
  observed.renders += 1;
  observed.setLocation = setLocation;
  observed.clearLocation = clearLocation;

  return (
    <div>
      <output data-testid="locationName">{location?.name ?? 'none'}</output>
      <output data-testid="locationCoords">
        {location?.latitude === undefined ? 'none' : `${location.latitude},${location.longitude}`}
      </output>
    </div>
  );
}

function renderProvider() {
  return render(
    <LocationProvider>
      <LocationProbe />
    </LocationProvider>
  );
}

function renderPickerInProvider() {
  return render(
    <LocationProvider>
      <LocationProbe />
      <LocationPicker />
    </LocationProvider>
  );
}

function storedLocation(): ActiveLocation | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ActiveLocation) : null;
}

function fakePosition(latitude: number, longitude: number): GeolocationPosition {
  const coords = {
    latitude,
    longitude,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({ latitude, longitude }),
  } as GeolocationCoordinates;
  return { coords, timestamp: 0, toJSON: () => ({ coords, timestamp: 0 }) };
}

function fakePositionError(code: number): GeolocationPositionError {
  return {
    code,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
    message: code === 1 ? 'User denied geolocation' : 'Position unavailable',
  };
}

async function expectNoViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

describe('LocationContext', () => {
  const geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

  beforeEach(() => {
    localStorage.clear();
    observed.renders = 0;
    observed.setLocation = null;
    observed.clearLocation = null;
    mocks.searchLocations.mockReset().mockResolvedValue([]);
    mocks.reverseGeocode.mockReset().mockResolvedValue({ name: 'Bengaluru', region: 'Karnataka', country: 'India' });
    mocks.getCurrentPosition.mockReset();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: mocks.getCurrentPosition },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    if (geolocationDescriptor) {
      Object.defineProperty(navigator, 'geolocation', geolocationDescriptor);
    }
  });

  it('throws a descriptive error when useLocation is called outside LocationProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<LocationProbe />)).toThrow('useLocation must be used within LocationProvider');
  });

  it('starts with no location and clears the storage key on mount', async () => {
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const { container } = renderProvider();

    expect(screen.getByTestId('locationName')).toHaveTextContent('none');
    expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    await expectNoViolations(container);
  });

  it('hydrates a valid stored location on the first render', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(delhi()));
    const { container } = renderProvider();

    expect(screen.getByTestId('locationName')).toHaveTextContent('Delhi');
    expect(screen.getByTestId('locationCoords')).toHaveTextContent('28.6139,77.209');
    await expectNoViolations(container);
  });

  it.each([
    ['corrupt JSON', '{not-json'],
    ['empty name', JSON.stringify({ name: '' })],
    ['numeric name', JSON.stringify({ name: 42 })],
    ['null value', 'null'],
  ])('ignores %s in storage', async (_label, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    const { container } = renderProvider();

    expect(screen.getByTestId('locationName')).toHaveTextContent('none');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await expectNoViolations(container);
  });

  it('persists a chosen location and removes it again on clear', async () => {
    const { container } = renderProvider();

    act(() => observed.setLocation?.(delhi()));
    expect(screen.getByTestId('locationName')).toHaveTextContent('Delhi');
    expect(storedLocation()).toEqual(delhi());

    act(() => observed.clearLocation?.());
    expect(screen.getByTestId('locationName')).toHaveTextContent('none');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await expectNoViolations(container);
  });

  it('refuses nameless locations without changing or persisting state', async () => {
    const { container } = renderProvider();

    act(() => observed.setLocation?.(delhi()));
    act(() => observed.setLocation?.({ name: '' }));
    act(() => observed.setLocation?.(null as unknown as ActiveLocation));

    expect(screen.getByTestId('locationName')).toHaveTextContent('Delhi');
    expect(storedLocation()).toEqual(delhi());
    await expectNoViolations(container);
  });

  it('treats re-pinning the same place as a no-op but treats missing region as a change', async () => {
    const { container } = renderProvider();

    act(() => observed.setLocation?.(delhi()));
    const rendersAfterFirstPin = observed.renders;
    act(() => observed.setLocation?.(delhi()));

    expect(observed.renders).toBe(rendersAfterFirstPin);

    act(() => observed.setLocation?.({ name: 'Delhi', latitude: 28.6139, longitude: 77.209 }));

    expect(observed.renders).toBe(rendersAfterFirstPin + 1);
    expect(screen.getByTestId('locationName')).toHaveTextContent('Delhi');
    await expectNoViolations(container);
  });

  it('keeps setLocation and clearLocation identities stable across updates', async () => {
    const { container } = renderProvider();
    const firstSet = observed.setLocation;
    const firstClear = observed.clearLocation;

    act(() => observed.setLocation?.(delhi()));

    expect(observed.setLocation).toBe(firstSet);
    expect(observed.clearLocation).toBe(firstClear);
    await expectNoViolations(container);
  });

  it('keeps working in memory when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage full');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const { container } = renderProvider();

    expect(screen.getByTestId('locationName')).toHaveTextContent('none');
    act(() => observed.setLocation?.(delhi()));
    expect(screen.getByTestId('locationName')).toHaveTextContent('Delhi');
    await expectNoViolations(container);
  });

  it.each([
    [{ name: 'Delhi', latitude: 28.6139, longitude: 77.209 }, { lat: 28.6139, lon: 77.209 }],
    [{ name: 'Delhi' }, { city: 'Delhi' }],
    [{ name: 'Delhi', latitude: 0, longitude: 0 }, { lat: 0, lon: 0 }],
    [{ name: 'Delhi', latitude: 12 }, { city: 'Delhi' }],
  ])('builds backend params for %j', (location, expected) => {
    expect(toLocationParams(location as ActiveLocation)).toEqual(expected);
  });

  it('persists a searched place selected through LocationPicker', async () => {
    const user = userEvent.setup();
    mocks.searchLocations.mockResolvedValue([suggestion()]);
    const { container } = renderPickerInProvider();

    await user.type(screen.getByRole('combobox', { name: 'Search for a city or place' }), 'Del');
    const option = await screen.findByRole('option', { name: /Delhi/ }, { timeout: 1000 });
    await user.click(option);

    expect(screen.getByTestId('locationName')).toHaveTextContent('Delhi');
    expect(storedLocation()).toEqual(delhi());
    await expectNoViolations(container);
  });

  it('persists the reverse-geocoded place from geolocation success', async () => {
    const user = userEvent.setup();
    mocks.getCurrentPosition.mockImplementation((success) => success(fakePosition(12.34, 56.78)));
    const { container } = renderPickerInProvider();

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    await waitFor(() => expect(mocks.reverseGeocode).toHaveBeenCalledWith(12.34, 56.78));
    await waitFor(() => expect(screen.getByTestId('locationName')).toHaveTextContent('Bengaluru, Karnataka, India'));
    expect(storedLocation()).toEqual({
      name: 'Bengaluru, Karnataka, India',
      latitude: 12.34,
      longitude: 56.78,
      region: 'Karnataka',
      country: 'India',
    });
    await expectNoViolations(container);
  });

  it('falls back to a generic label when reverse geocoding fails', async () => {
    const user = userEvent.setup();
    mocks.getCurrentPosition.mockImplementation((success) => success(fakePosition(1.5, 2.5)));
    mocks.reverseGeocode.mockRejectedValue(new Error('no place found'));
    const { container } = renderPickerInProvider();

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    await waitFor(() => expect(screen.getByTestId('locationName')).toHaveTextContent('My location'));
    expect(storedLocation()).toEqual({ name: 'My location', latitude: 1.5, longitude: 2.5 });
    await expectNoViolations(container);
  });

  it('keeps the location empty and shows an alert when geolocation permission is denied', async () => {
    const user = userEvent.setup();
    mocks.getCurrentPosition.mockImplementation((_success, failure) => failure(fakePositionError(1)));
    const { container } = renderPickerInProvider();

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location permission was denied. Search for a city instead.'
    );
    expect(screen.getByTestId('locationName')).toHaveTextContent('none');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await expectNoViolations(container);
  });

  it('reports an unsupported browser without calling geolocation', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    const user = userEvent.setup();
    const { container } = renderPickerInProvider();

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Geolocation is not supported by this browser.');
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByTestId('locationName')).toHaveTextContent('none');
    expect(within(container).getByTestId('locationName')).toBeInTheDocument();
    await expectNoViolations(container);
  });
});
