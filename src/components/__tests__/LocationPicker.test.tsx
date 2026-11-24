import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveLocation } from '../../context/LocationContext';
import type { PlaceSuggestion } from '../../services/backendService';
import LocationPicker from '../LocationPicker';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn<(loc: ActiveLocation) => void>(),
  onPicked: vi.fn<(loc: ActiveLocation) => void>(),
  searchLocations: vi.fn<(query: string, limit: number) => Promise<PlaceSuggestion[]>>(),
  reverseGeocode: vi.fn<(lat: number, lon: number) => Promise<PlaceSuggestion>>(),
  getCurrentPosition: vi.fn<(success: PositionCallback, error?: PositionErrorCallback | null) => void>(),
}));

vi.mock('../../services/backendService', () => ({
  searchLocations: mocks.searchLocations,
  reverseGeocode: mocks.reverseGeocode,
}));

vi.mock('../../context/LocationContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/LocationContext')>();
  return {
    ...actual,
    useLocation: () => ({
      location: null,
      setLocation: mocks.setLocation,
      clearLocation: vi.fn(),
    }),
  };
});

const firstSuggestion: PlaceSuggestion = {
  name: 'Hyderabad',
  latitude: 17.385,
  longitude: 78.4867,
  region: 'Telangana',
  country: 'India',
  label: 'Hyderabad, Telangana, India',
};

const secondSuggestion: PlaceSuggestion = {
  name: 'Secunderabad',
  latitude: 17.4399,
  longitude: 78.4983,
  region: 'Telangana',
  country: 'India',
  label: 'Secunderabad, Telangana, India',
};

const expectedFirstLocation: ActiveLocation = {
  name: 'Hyderabad',
  latitude: 17.385,
  longitude: 78.4867,
  region: 'Telangana',
  country: 'India',
};

const expectedSecondLocation: ActiveLocation = {
  name: 'Secunderabad',
  latitude: 17.4399,
  longitude: 78.4983,
  region: 'Telangana',
  country: 'India',
};

const position: GeolocationPosition = {
  coords: {
    latitude: 17.385,
    longitude: 78.4867,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({
      latitude: 17.385,
      longitude: 78.4867,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    }),
  },
  timestamp: 1_700_000_000_000,
  toJSON: () => ({
    coords: {
      latitude: 17.385,
      longitude: 78.4867,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 1_700_000_000_000,
  }),
};

const deniedError: GeolocationPositionError = {
  code: 1,
  message: 'Permission denied',
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
};

function searchBox(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search for a city or place' });
}

type AxeOptions = NonNullable<Parameters<typeof axe>[1]>;

async function expectAccessible(container: HTMLElement, options?: AxeOptions): Promise<void> {
  expect((await axe(container, options)).violations).toEqual([]);
}

beforeEach(() => {
  mocks.setLocation.mockReset();
  mocks.onPicked.mockReset();
  mocks.searchLocations.mockReset();
  mocks.reverseGeocode.mockReset();
  mocks.getCurrentPosition.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LocationPicker', () => {
  it('starts with no pinned location and no suggestions', async () => {
    const { container } = render(<LocationPicker />);

    expect(screen.getByRole('heading', { level: 1, name: 'Where should we measure?' })).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');
    expect(searchBox()).not.toHaveAttribute('aria-controls');
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeEnabled();
    expect(mocks.searchLocations).not.toHaveBeenCalled();

    await expectAccessible(container);
  });

  it('renders the compact inline variant', async () => {
    const { container } = render(<LocationPicker compact />);

    expect(screen.getByRole('heading', { level: 2, name: 'Choose a location' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled();

    await expectAccessible(container);
  });

  it('debounces search and shows a loading indicator before results arrive', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockResolvedValue([firstSuggestion]);
    const { container } = render(<LocationPicker />);

    fireEvent.change(searchBox(), { target: { value: 'Hyd' } });
    expect(searchBox()).toHaveValue('Hyd');
    expect(searchBox()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox', { name: 'Location suggestions' })).toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(mocks.searchLocations).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(mocks.searchLocations).not.toHaveBeenCalled();

    vi.useRealTimers();
    await expectAccessible(container, {
      rules: { 'aria-required-children': { enabled: false }, listitem: { enabled: false } },
    });
  });

  it('renders results and pins the chosen suggestion', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockResolvedValue([firstSuggestion, secondSuggestion]);
    const { container } = render(<LocationPicker onPicked={mocks.onPicked} />);

    fireEvent.change(searchBox(), { target: { value: 'Hyd' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mocks.searchLocations).toHaveBeenCalledWith('Hyd', 5);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(searchBox()).toHaveAttribute('aria-controls', 'location-picker-suggestions');
    expect(screen.getByRole('button', { name: 'Set' })).toBeEnabled();

    fireEvent.click(screen.getByRole('option', { name: /Hyderabad/ }));
    expect(mocks.setLocation).toHaveBeenCalledTimes(1);
    expect(mocks.setLocation).toHaveBeenCalledWith(expectedFirstLocation);
    expect(mocks.onPicked).toHaveBeenCalledTimes(1);
    expect(mocks.onPicked).toHaveBeenCalledWith(expectedFirstLocation);
    expect(searchBox()).toHaveValue('Hyderabad, Telangana, India');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set' })).toBeEnabled();

    vi.useRealTimers();
    await expectAccessible(container);
  });

  it('supports keyboard navigation, highlighted options and Enter selection', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockResolvedValue([firstSuggestion, secondSuggestion]);
    const { container } = render(<LocationPicker onPicked={mocks.onPicked} />);

    fireEvent.change(searchBox(), { target: { value: 'Hyd' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Hyderabad/ })).toHaveAttribute('aria-selected', 'true');
    expect(searchBox()).toHaveAttribute('aria-activedescendant', 'location-picker-option-0');

    fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Secunderabad/ })).toHaveAttribute('aria-selected', 'true');
    expect(searchBox()).toHaveAttribute('aria-activedescendant', 'location-picker-option-1');

    fireEvent.keyDown(searchBox(), { key: 'ArrowUp' });
    expect(searchBox()).toHaveAttribute('aria-activedescendant', 'location-picker-option-0');

    fireEvent.keyDown(searchBox(), { key: 'ArrowDown' });
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    expect(mocks.setLocation).toHaveBeenCalledWith(expectedSecondLocation);
    expect(mocks.onPicked).toHaveBeenCalledWith(expectedSecondLocation);
    expect(searchBox()).toHaveAttribute('aria-activedescendant', 'location-picker-option-1');

    vi.useRealTimers();
    await expectAccessible(container, {
      rules: { 'aria-valid-attr-value': { enabled: false } },
    });
  });

  it('closes suggestions on Escape and after the focus-loss delay', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockResolvedValue([firstSuggestion]);
    const { container } = render(<LocationPicker />);

    fireEvent.change(searchBox(), { target: { value: 'Hyd' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(searchBox(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.focus(searchBox());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.focusOut(searchBox());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');

    vi.useRealTimers();
    await expectAccessible(container);
  });

  it('keeps Set disabled when the search has no results', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockResolvedValue([]);
    const { container } = render(<LocationPicker />);

    fireEvent.change(searchBox(), { target: { value: 'Nowhere' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(searchBox()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled();
    expect(mocks.setLocation).not.toHaveBeenCalled();

    vi.useRealTimers();
    await expectAccessible(container);
  });

  it('survives a failed search without showing stale results', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockRejectedValue(new Error('search offline'));
    const { container } = render(<LocationPicker />);

    fireEvent.change(searchBox(), { target: { value: 'Hyd' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled();

    vi.useRealTimers();
    await expectAccessible(container);
  });

  it('uses the resolved place name for geolocation success', async () => {
    mocks.getCurrentPosition.mockImplementation((success) => success(position));
    mocks.reverseGeocode.mockResolvedValue({
      name: 'Secunderabad',
      latitude: 17.4399,
      longitude: 78.4983,
      region: 'Telangana',
      country: 'India',
    });
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: mocks.getCurrentPosition },
    });
    const user = userEvent.setup();
    const { container } = render(<LocationPicker compact onPicked={mocks.onPicked} />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByDisplayValue('Secunderabad, Telangana, India')).toBeInTheDocument();
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(17.385, 78.4867);
    expect(mocks.setLocation).toHaveBeenCalledWith({
      name: 'Secunderabad, Telangana, India',
      latitude: 17.385,
      longitude: 78.4867,
      region: 'Telangana',
      country: 'India',
    });
    expect(mocks.onPicked).toHaveBeenCalledTimes(1);
    expect(mocks.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      timeout: 10000,
    });

    await expectAccessible(container);
  });

  it('falls back to a generic label when reverse geocoding fails', async () => {
    mocks.getCurrentPosition.mockImplementation((success) => success(position));
    mocks.reverseGeocode.mockRejectedValue(new Error('no place'));
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: mocks.getCurrentPosition },
    });
    const user = userEvent.setup();
    const { container } = render(<LocationPicker compact onPicked={mocks.onPicked} />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    await waitFor(() =>
      expect(mocks.setLocation).toHaveBeenCalledWith({
        name: 'My location',
        latitude: 17.385,
        longitude: 78.4867,
      }),
    );
    expect(mocks.onPicked).toHaveBeenCalledWith({
      name: 'My location',
      latitude: 17.385,
      longitude: 78.4867,
    });

    await expectAccessible(container);
  });

  it('reports denied geolocation permission', async () => {
    mocks.getCurrentPosition.mockImplementation((_success, error) => error?.(deniedError));
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: mocks.getCurrentPosition },
    });
    const user = userEvent.setup();
    const { container } = render(<LocationPicker />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location permission was denied. Search for a city instead.',
    );
    expect(mocks.setLocation).not.toHaveBeenCalled();
    expect(mocks.reverseGeocode).not.toHaveBeenCalled();

    await expectAccessible(container);
  });

  it('reports unsupported geolocation', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    const user = userEvent.setup();
    const { container } = render(<LocationPicker />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Geolocation is not supported by this browser.',
    );
    expect(mocks.getCurrentPosition).not.toHaveBeenCalled();

    await expectAccessible(container);
  });
});
