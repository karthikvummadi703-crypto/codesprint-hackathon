import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CarbonFootprintPage from '../CarbonFootprintPage';
import { useAuth } from '../../context/AuthContext';
import { calculateCarbon, estimateDistance } from '../../services/backendService';
import { addCarbonTrip, deleteCarbonTrip, listCarbonTrips } from '../../services/dataService';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/backendService', () => ({
  calculateCarbon: vi.fn(),
  estimateDistance: vi.fn(),
}));
vi.mock('../../services/dataService', () => ({
  addCarbonTrip: vi.fn(),
  listCarbonTrips: vi.fn(),
  deleteCarbonTrip: vi.fn(),
}));

const user = { uid: 'user-1' };

async function renderPage() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<CarbonFootprintPage />);
  });
  if (!result) throw new Error('CarbonFootprintPage did not render');
  return result;
}

async function expectAxeViolationIds(container: HTMLElement, expected: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual(expected);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));

  vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(listCarbonTrips).mockResolvedValue([]);
  vi.mocked(addCarbonTrip).mockResolvedValue('trip-new');
  vi.mocked(deleteCarbonTrip).mockResolvedValue(undefined);
  vi.mocked(estimateDistance).mockResolvedValue({ distanceKm: 0 });
  vi.mocked(calculateCarbon).mockResolvedValue({
    distanceKm: 12,
    co2eKg: 2.4,
    mode: 'Bike',
    savings: 0,
    estimated: false,
  });

  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CarbonFootprintPage', () => {
  it('renders the no-calculation and no-trips empty states after loading', async () => {
    const { container } = await renderPage();

    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    expect(screen.getByText('No trips saved yet.')).toBeInTheDocument();
    expect(listCarbonTrips).toHaveBeenCalledWith('user-1');
    await expectAxeViolationIds(container);
  });

  it('renders saved trips, total savings, and removes a deleted trip', async () => {
    vi.mocked(listCarbonTrips).mockResolvedValue([
      {
        id: 't1',
        origin: 'Home',
        destination: 'Office',
        distanceKm: 10,
        mode: 'Bike',
        co2eKg: 1.2,
        date: '2026-03-01T09:00:00.000Z',
        savings: 0.7,
      },
      {
        id: 't2',
        origin: 'Gym',
        destination: 'Home',
        distanceKm: 4,
        mode: 'Walking',
        co2eKg: 0,
        date: '2026-03-02T09:00:00.000Z',
      },
    ]);
    const testUser = userEvent.setup();
    const { container } = await renderPage();

    expect(screen.getByText('Home → Office')).toBeInTheDocument();
    expect(screen.getByText('Saved 0.7 kg')).toBeInTheDocument();
    expect(screen.getByText(/0\.7 kg CO₂e Saved/)).toBeInTheDocument();

    await testUser.click(screen.getByRole('button', { name: 'Delete trip from Home to Office' }));

    expect(screen.queryByText('Home → Office')).not.toBeInTheDocument();
    expect(deleteCarbonTrip).toHaveBeenCalledWith('user-1', 't1');
    await expectAxeViolationIds(container);
  });

  it('auto-estimates the distance only after both places are entered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));
    vi.mocked(estimateDistance).mockResolvedValue({ distanceKm: 18.5 });
    const { container } = await renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: 'From (Origin)' }), {
      target: { value: 'Home' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'To (Destination)' }), {
      target: { value: 'Office' },
    });

    expect(estimateDistance).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(estimateDistance).toHaveBeenCalledWith({ origin: 'Home', destination: 'Office' });
    expect(screen.getByRole('spinbutton', { name: 'Distance (km)' })).toHaveValue(18.5);

    vi.useRealTimers();
    await expectAxeViolationIds(container);
  });

  it('calculates with the chosen mode, warns about estimates, and saves the trip', async () => {
    vi.mocked(calculateCarbon).mockResolvedValue({
      distanceKm: 18.5,
      co2eKg: 0.9,
      mode: 'Bike',
      savings: 0,
      estimated: true,
    });
    vi.mocked(listCarbonTrips)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'trip-new',
          origin: 'Home',
          destination: 'Office',
          distanceKm: 18.5,
          mode: 'Bike',
          co2eKg: 0.9,
          date: '2026-03-10T10:00:00.000Z',
        },
      ]);
    const testUser = userEvent.setup();
    const { container } = await renderPage();

    await testUser.type(screen.getByRole('textbox', { name: 'From (Origin)' }), 'Home');
    await testUser.type(screen.getByRole('textbox', { name: 'To (Destination)' }), 'Office');
    await testUser.clear(screen.getByRole('spinbutton', { name: 'Distance (km)' }));
    await testUser.type(screen.getByRole('spinbutton', { name: 'Distance (km)' }), '18.5');
    await testUser.click(screen.getByRole('button', { name: /Bike/ }));

    expect(screen.getByRole('button', { name: /Bike/ })).toHaveAttribute('aria-pressed', 'true');
    await testUser.click(screen.getByRole('button', { name: 'Calculate Emissions' }));

    expect(await screen.findByText('Emissions Calculated')).toBeInTheDocument();
    expect(screen.getByText(/Distance is a straight-line estimate/)).toBeInTheDocument();
    expect(screen.getByText(/0\.9/)).toBeInTheDocument();
    expect(calculateCarbon).toHaveBeenCalledWith({
      origin: 'Home',
      destination: 'Office',
      distanceKm: 18.5,
      mode: 'Bike',
    });

    await testUser.click(screen.getByRole('button', { name: 'Save to Log' }));

    expect(await screen.findByText('Home → Office')).toBeInTheDocument();
    expect(addCarbonTrip).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        origin: 'Home',
        destination: 'Office',
        mode: 'Bike',
        co2eKg: 0.9,
        savings: 2.65,
      }),
    );
    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });

  it('falls back to a local calculation with an error notice and can cancel the result', async () => {
    vi.mocked(calculateCarbon).mockRejectedValue(new Error('Backend down'));
    const testUser = userEvent.setup();
    const { container } = await renderPage();

    await testUser.type(screen.getByRole('textbox', { name: 'From (Origin)' }), 'Home');
    await testUser.type(screen.getByRole('textbox', { name: 'To (Destination)' }), 'Office');
    await testUser.clear(screen.getByRole('spinbutton', { name: 'Distance (km)' }));
    await testUser.type(screen.getByRole('spinbutton', { name: 'Distance (km)' }), '10');
    await testUser.click(screen.getByRole('button', { name: 'Calculate Emissions' }));

    expect(await screen.findByText('Emissions Calculated')).toBeInTheDocument();
    expect(
      screen.getByText('Backend unavailable — used local calculation instead.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Backend down')).toBeInTheDocument();
    expect(screen.getByText(/1\.92/)).toBeInTheDocument();

    await testUser.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });
});
