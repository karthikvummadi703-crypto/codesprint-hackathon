import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveLocation } from '../../context/LocationContext';
import type { PlaceSuggestion } from '../../services/backendService';
import LocationPicker from '../LocationPicker';

type PositionSuccess = (position: GeolocationPosition) => void;
type PositionFailure = (error: GeolocationPositionError) => void;

const mocks = vi.hoisted(() => ({
  searchLocations: vi.fn(),
  reverseGeocode: vi.fn(),
  setLocation: vi.fn(),
  getCurrentPosition: vi.fn<(success: PositionSuccess, failure: PositionFailure, options?: PositionOptions) => void>(),
}));

vi.mock('../../services/backendService', () => ({
  searchLocations: mocks.searchLocations,
  reverseGeocode: mocks.reverseGeocode,
}));

vi.mock('../../context/LocationContext', () => ({
  useLocation: () => ({ setLocation: mocks.setLocation }),
}));

const delhi: PlaceSuggestion = {
  name: 'Delhi',
  latitude: 28.6139,
  longitude: 77.209,
  region: 'Delhi',
  country: 'India',
  label: 'Delhi, India',
};

const mumbai: PlaceSuggestion = {
  name: 'Mumbai',
  latitude: 19.076,
  longitude: 72.8777,
  region: 'Maharashtra',
  country: 'India',
  label: 'Mumbai, India',
};

function deferred<T>() {
  let resolveValue: (value: T) => void = () => undefined;
  let rejectValue: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  return { promise, resolve: resolveValue, reject: rejectValue };
}

function fakePosition(latitude: number, longitude: number): GeolocationPosition {
  const values = {
    latitude,
    longitude,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };
  const coords: GeolocationCoordinates = { ...values, toJSON: () => values };
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

describe('LocationPicker', () => {
  beforeEach(() => {
    mocks.searchLocations.mockReset().mockResolvedValue([]);
    mocks.reverseGeocode.mockReset();
    mocks.setLocation.mockReset();
    mocks.getCurrentPosition.mockReset();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: mocks.getCurrentPosition },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the first-run screen with no preselected location and no axe violations', async () => {
    const { container } = render(<LocationPicker onPicked={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Where should we measure?' })).toBeInTheDocument();
    expect(screen.getByText(/we do not pick one for you/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled();
    expect(mocks.searchLocations).not.toHaveBeenCalled();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders the compact variant with a heading instead of the full-screen heading', async () => {
    const { container } = render(<LocationPicker compact onPicked={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Choose a location' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing is guessed on your behalf/i)).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('debounces search, shows loading, then lists suggestions with no axe violations', async () => {
    const user = userEvent.setup();
    const pending = deferred<PlaceSuggestion[]>();
    mocks.searchLocations.mockReturnValue(pending.promise);
    const { container } = render(<LocationPicker />);

    const input = screen.getByRole('combobox', { name: 'Search for a city or place' });
    await user.type(input, 'Del');

    expect(mocks.searchLocations).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.searchLocations).toHaveBeenCalledWith('Del', 5), { timeout: 1000 });
    expect(await screen.findByText('Searching…')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await act(async () => {
      pending.resolve([delhi, mumbai]);
    });

    const listbox = await screen.findByRole('listbox', { name: 'Location suggestions' });
    expect(within(listbox).getAllByRole('option')).toHaveLength(2);
    expect(within(listbox).getByRole('option', { name: /Delhi/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set' })).toBeEnabled();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('leaves the Set button disabled when the search rejects', async () => {
    const user = userEvent.setup();
    mocks.searchLocations.mockRejectedValue(new Error('network down'));
    render(<LocationPicker />);

    await user.type(screen.getByRole('combobox'), 'Del');
    await waitFor(() => expect(mocks.searchLocations).toHaveBeenCalledTimes(1), { timeout: 1000 });
    await waitFor(() => expect(screen.queryByText('Searching…')).not.toBeInTheDocument());

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set' })).toBeDisabled();
  });

  it('supports ArrowDown, ArrowUp and aria-activedescendant on the listbox', async () => {
    const user = userEvent.setup();
    mocks.searchLocations.mockResolvedValue([delhi, mumbai]);
    render(<LocationPicker />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'De');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2), { timeout: 1000 });
    const options = screen.getAllByRole('option');

    expect(input).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'location-picker-option-0');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'location-picker-option-1');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'location-picker-option-1');
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', 'location-picker-option-0');
    await user.keyboard('{ArrowUp}');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('picks the active option with Enter and calls both callbacks once', async () => {
    const user = userEvent.setup();
    const onPicked = vi.fn<(location: ActiveLocation) => void>();
    mocks.searchLocations.mockResolvedValue([delhi, mumbai]);
    render(<LocationPicker onPicked={onPicked} />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'De');
    await screen.findAllByRole('option', undefined, { timeout: 1000 });
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    const expected: ActiveLocation = {
      name: 'Mumbai',
      latitude: 19.076,
      longitude: 72.8777,
      region: 'Maharashtra',
      country: 'India',
    };
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked).toHaveBeenCalledWith(expected);
    expect(mocks.setLocation).toHaveBeenCalledWith(expected);
    expect(input).toHaveValue('Mumbai, India');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('hides suggestions on Escape, reopens on focus, and picks by click', async () => {
    const user = userEvent.setup();
    const onPicked = vi.fn<(location: ActiveLocation) => void>();
    mocks.searchLocations.mockResolvedValue([delhi]);
    render(<LocationPicker onPicked={onPicked} />);

    const input = screen.getByRole('combobox');
    await user.type(input, 'Del');
    await screen.findByRole('option', { name: /Delhi|Mumbai/ }, { timeout: 1000 });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.focus(input);
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: /Delhi/ }));

    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked.mock.calls[0][0]).toMatchObject({ name: 'Delhi', latitude: 28.6139 });
    expect(mocks.setLocation).toHaveBeenCalledTimes(1);
  });

  it('submits the first suggestion with Set when no option is active and tolerates a missing onPicked', async () => {
    const user = userEvent.setup();
    mocks.searchLocations.mockResolvedValue([delhi, mumbai]);
    render(<LocationPicker />);

    await user.type(screen.getByRole('combobox'), 'Del');
    await screen.findAllByRole('option', undefined, { timeout: 1000 });
    await user.click(screen.getByRole('button', { name: 'Set' }));

    expect(mocks.setLocation).toHaveBeenCalledTimes(1);
    expect(mocks.setLocation.mock.calls[0][0]).toMatchObject({ name: 'Delhi' });
  });

  it('uses the browser position and the reverse-geocoded place when available', async () => {
    const user = userEvent.setup();
    const onPicked = vi.fn<(location: ActiveLocation) => void>();
    mocks.getCurrentPosition.mockImplementation((success) => {
      success(fakePosition(12.34, 56.78));
    });
    mocks.reverseGeocode.mockResolvedValue({ name: 'Bengaluru', region: 'Karnataka', country: 'India' });
    const { container } = render(<LocationPicker onPicked={onPicked} />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(mocks.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      timeout: 10000,
    });
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toEqual({
      name: 'Bengaluru, Karnataka, India',
      latitude: 12.34,
      longitude: 56.78,
      region: 'Karnataka',
      country: 'India',
    });
    expect(screen.getByRole('combobox')).toHaveValue('Bengaluru, Karnataka, India');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('falls back to the honest "My location" label when reverse geocoding fails', async () => {
    const user = userEvent.setup();
    mocks.getCurrentPosition.mockImplementation((success) => success(fakePosition(1.5, 2.5)));
    mocks.reverseGeocode.mockRejectedValue(new Error('no place found'));
    render(<LocationPicker compact />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    await waitFor(() => expect(mocks.setLocation).toHaveBeenCalledWith({
      name: 'My location',
      latitude: 1.5,
      longitude: 2.5,
    }));
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(1.5, 2.5);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the permission-denied message for a PERMISSION_DENIED position error', async () => {
    const user = userEvent.setup();
    mocks.getCurrentPosition.mockImplementation((_success, failure) => {
      failure(fakePositionError(1));
    });
    const { container } = render(<LocationPicker />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location permission was denied. Search for a city instead.'
    );
    expect(mocks.setLocation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeEnabled();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('shows the generic message for other position errors and for unsupported browsers', async () => {
    const user = userEvent.setup();
    mocks.getCurrentPosition.mockImplementation((_success, failure) => {
      failure(fakePositionError(2));
    });
    const { rerender, container } = render(<LocationPicker />);

    await user.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not determine your location. Search for a city instead.'
    );

    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    rerender(<LocationPicker />);
    await user.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Geolocation is not supported by this browser.');
    expect(mocks.getCurrentPosition).toHaveBeenCalledTimes(1);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
