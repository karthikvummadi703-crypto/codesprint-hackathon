import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RoutinesPage from '../RoutinesPage';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { fetchAQI, searchLocations } from '../../services/backendService';
import { getLifestyleSettings, saveLifestyleSettings } from '../../services/dataService';
import {
  buildDailyRoutines,
  isWinterSmogSeason,
} from '../../services/lifestyleService';
import type { DailyRoutine } from '../../types';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/LocationContext', () => ({
  useLocation: vi.fn(),
  toLocationParams: vi.fn((place: { name: string; latitude?: number; longitude?: number }) =>
    typeof place.latitude === 'number' && typeof place.longitude === 'number'
      ? { lat: place.latitude, lon: place.longitude }
      : { city: place.name }
  ),
}));
vi.mock('../../services/backendService', () => ({
  fetchAQI: vi.fn(),
  searchLocations: vi.fn(),
}));
vi.mock('../../services/dataService', () => ({
  getLifestyleSettings: vi.fn(),
  saveLifestyleSettings: vi.fn(),
}));
vi.mock('../../services/lifestyleService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/lifestyleService')>();
  return {
    ...actual,
    buildDailyRoutines: vi.fn(),
    isWinterSmogSeason: vi.fn(),
  };
});

const user = { uid: 'user-1' };
const location = { name: 'Test City' };
const routines: DailyRoutine[] = [
  {
    id: 'r1',
    title: 'Filter the main room',
    category: 'indoor-air',
    detail: 'Use a HEPA purifier.',
    impact: 'Removes particles.',
    priority: 'high',
  },
  {
    id: 'r2',
    title: 'Walk short trips',
    category: 'low-emission',
    detail: 'Replace a short car trip.',
    impact: 'Avoids emissions.',
    priority: 'medium',
  },
];

async function expectAxeViolationIds(container: HTMLElement, expected: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map((violation) => violation.id)).toEqual(expected);
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useLocation).mockReturnValue({
    location,
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
  });

  vi.mocked(getLifestyleSettings).mockResolvedValue(null);
  vi.mocked(saveLifestyleSettings).mockResolvedValue(undefined);
  vi.mocked(fetchAQI).mockResolvedValue({ aqi: 42, status: 'Good' });
  vi.mocked(searchLocations).mockResolvedValue([]);
  vi.mocked(buildDailyRoutines).mockReturnValue(routines);
  vi.mocked(isWinterSmogSeason).mockReturnValue(false);

  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RoutinesPage', () => {
  it('loads saved household data and live AQI, then renders generated routines', async () => {
    vi.mocked(getLifestyleSettings).mockResolvedValue({
      household: { members: [{ id: 'm1', name: 'Riya', kind: 'child' }] },
      communityWatch: [
        { id: 'p1', name: 'School', latitude: 11.1, longitude: 22.2, label: 'School gate' },
      ],
    });
    vi.mocked(fetchAQI).mockImplementation(async (params) =>
      'lat' in params
        ? { aqi: 130, status: 'Unhealthy for Sensitive Groups' }
        : { aqi: 88, status: 'Moderate' }
    );

    const { container } = render(<RoutinesPage />);

    expect(await screen.findByText('Riya')).toBeInTheDocument();
    expect(screen.getByText('School gate')).toBeInTheDocument();
    expect(await screen.findByText('AQI 130')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText(/Moderate/)).toBeInTheDocument();
    expect(screen.getByText(/with sensitive household members in mind/)).toBeInTheDocument();
    expect(screen.getByText('Filter the main room')).toBeInTheDocument();
    expect(screen.getByText('Walk short trips')).toBeInTheDocument();
    expect(fetchAQI).toHaveBeenCalledWith({ city: 'Test City' });
    expect(fetchAQI).toHaveBeenCalledWith({ lat: 11.1, lon: 22.2 });
    expect(buildDailyRoutines).toHaveBeenCalledWith(
      expect.objectContaining({
        aqi: 88,
        status: 'Moderate',
        household: { members: [{ id: 'm1', name: 'Riya', kind: 'child' }] },
      })
    );
    await expectAxeViolationIds(container);
  });

  it('shows the no-reading and empty saved states without breaking routine generation', async () => {
    vi.mocked(fetchAQI).mockRejectedValue(new Error('offline'));
    vi.mocked(getLifestyleSettings).mockResolvedValue(null);

    const { container } = render(<RoutinesPage />);

    expect(
      await screen.findByText(/No live reading is available for Test City/)
    ).toBeInTheDocument();
    expect(screen.getByText('No members yet. Add the people you plan for.')).toBeInTheDocument();
    expect(screen.getByText('No places saved yet.')).toBeInTheDocument();
    expect(screen.getByText('Outside winter smog season')).toBeInTheDocument();
    expect(screen.getByText(/2 routines are available to the AI assistant/)).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });

  it('adds and removes a household member and regenerates the plan', async () => {
    const testUser = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    await testUser.type(screen.getByLabelText('Name'), 'Arjun');
    await testUser.selectOptions(screen.getByLabelText('Needs'), 'respiratory');
    await testUser.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByText('Arjun')).toBeInTheDocument();
    expect(screen.getByText('respiratory')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(buildDailyRoutines).toHaveBeenCalledWith(
      expect.objectContaining({
        household: { members: [expect.objectContaining({ name: 'Arjun', kind: 'respiratory' })] },
      })
    );

    await testUser.click(screen.getByRole('button', { name: 'Remove Arjun from household' }));

    expect(screen.queryByText('Arjun')).not.toBeInTheDocument();
    expect(screen.getByText('No members yet. Add the people you plan for.')).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });

  it('debounces place search and adds a saved community place with its AQI', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));
    vi.mocked(searchLocations).mockResolvedValue([
      { name: 'City Library', latitude: 10.1, longitude: 20.2, label: 'City Library — Central' },
    ]);
    vi.mocked(fetchAQI).mockResolvedValue({ aqi: 55, status: 'Good' });

    const { container } = render(<RoutinesPage />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Search a community place' }), {
      target: { value: 'libr' },
    });
    expect(searchLocations).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchLocations).toHaveBeenCalledWith('libr', 5);
    fireEvent.click(screen.getByRole('option', { name: 'City Library — Central' }));

    expect(screen.getByText('City Library — Central')).toBeInTheDocument();
    expect(screen.getByText('AQI 55')).toBeInTheDocument();
    expect(fetchAQI).toHaveBeenCalledWith({ lat: 10.1, lon: 20.2 });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    vi.useRealTimers();
    await expectAxeViolationIds(container);
  });

  it('shows saving progress and a saved confirmation after persistence succeeds', async () => {
    let resolveSave: (value: void) => void = () => {};
    vi.mocked(saveLifestyleSettings).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    const testUser = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    await testUser.click(screen.getByRole('button', { name: /Save household/ }));

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    await expectAxeViolationIds(container);

    await act(async () => {
      resolveSave();
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(saveLifestyleSettings).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        household: { members: [] },
        communityWatch: [],
        routines,
        routinePromptContext: expect.stringContaining('Filter the main room'),
      })
    );
  });

  it('surfaces the persistence error when saving fails', async () => {
    vi.mocked(saveLifestyleSettings).mockRejectedValue(new Error('Firestore denied'));
    const testUser = userEvent.setup();
    const { container } = render(<RoutinesPage />);

    await testUser.click(screen.getByRole('button', { name: /Save household/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestore denied');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save household/ })).toBeEnabled();
    await expectAxeViolationIds(container);
  });
});
