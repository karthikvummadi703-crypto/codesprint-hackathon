import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CarbonFootprintPage from '../CarbonFootprintPage';
import type { CarbonTripRecord } from '../../types';

const mocks = vi.hoisted(() => ({
  user: { uid: 'user-1' },
  listCarbonTrips: vi.fn(),
  addCarbonTrip: vi.fn(),
  deleteCarbonTrip: vi.fn(),
  calculateCarbon: vi.fn(),
  estimateDistance: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));

vi.mock('../../services/dataService', () => ({
  listCarbonTrips: mocks.listCarbonTrips,
  addCarbonTrip: mocks.addCarbonTrip,
  deleteCarbonTrip: mocks.deleteCarbonTrip,
}));

vi.mock('../../services/backendService', () => ({
  calculateCarbon: mocks.calculateCarbon,
  estimateDistance: mocks.estimateDistance,
}));

const savedTrip: CarbonTripRecord = {
  id: 'trip-1',
  origin: 'Gudur Station',
  destination: 'Nellore Office',
  distanceKm: 120,
  mode: 'Bus',
  co2eKg: 10.68,
  date: '2026-01-10T09:00:00.000Z',
  savings: 12.4,
};

const apiResult = {
  distanceKm: 100,
  co2eKg: 4.1,
  mode: 'Bus',
  savings: 15.1,
  estimated: true,
};

type User = ReturnType<typeof userEvent.setup>;

async function fillRoute(user: User, origin = 'Gudur Station', destination = 'Nellore Office') {
  await user.type(screen.getByLabelText('From (Origin)'), origin);
  await user.type(screen.getByLabelText('To (Destination)'), destination);
  await waitFor(() => expect(mocks.estimateDistance).toHaveBeenCalledWith({ origin, destination }));
}

describe('CarbonFootprintPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T09:00:00.000Z'));
    vi.clearAllMocks();
    mocks.listCarbonTrips.mockResolvedValue([]);
    mocks.addCarbonTrip.mockResolvedValue('trip-2');
    mocks.deleteCarbonTrip.mockResolvedValue(undefined);
    mocks.estimateDistance.mockResolvedValue({ distanceKm: 0 });
    mocks.calculateCarbon.mockResolvedValue(apiResult);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists saved trips with their savings and shows no active calculation', async () => {
    mocks.listCarbonTrips.mockResolvedValue([savedTrip]);

    const { container } = render(<CarbonFootprintPage />);

    expect(await screen.findByText('Gudur Station → Nellore Office')).toBeInTheDocument();
    expect(mocks.listCarbonTrips).toHaveBeenCalledWith('user-1');
    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Recent trips log' })).toBeInTheDocument();
    expect(screen.getByText(/12\.4 kg CO₂e Saved/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete trip from Gudur Station to Nellore Office' }),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows the empty log when there are no saved trips', async () => {
    const { container } = render(<CarbonFootprintPage />);

    expect(await screen.findByText('No trips saved yet.')).toBeInTheDocument();
    expect(screen.queryByText(/kg CO₂e Saved/)).not.toBeInTheDocument();
    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('keeps the log usable when loading trips fails', async () => {
    mocks.listCarbonTrips.mockRejectedValue(new Error('Firestore down'));

    const { container } = render(<CarbonFootprintPage />);

    expect(await screen.findByText('No trips saved yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Travel Calculator' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('does not call the backend when the required route fields are empty', async () => {
    const user = userEvent.setup();
    const { container } = render(<CarbonFootprintPage />);

    await user.click(screen.getByRole('button', { name: 'Calculate Emissions' }));

    expect(mocks.calculateCarbon).not.toHaveBeenCalled();
    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('calculates with the chosen mode, auto-estimated distance and estimate note', async () => {
    const user = userEvent.setup();
    mocks.estimateDistance.mockResolvedValue({ distanceKm: 100 });
    const { container } = render(<CarbonFootprintPage />);

    await fillRoute(user);
    expect(await screen.findByDisplayValue('100')).toBeInTheDocument();

    const busButton = screen.getByRole('button', { name: /Bus/ });
    await user.click(busButton);
    expect(busButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Calculate Emissions' }));

    expect(await screen.findByText('Emissions Calculated')).toBeInTheDocument();
    expect(mocks.calculateCarbon).toHaveBeenCalledWith({
      origin: 'Gudur Station',
      destination: 'Nellore Office',
      distanceKm: 100,
      mode: 'Bus',
    });
    expect(screen.getByText('4.1')).toBeInTheDocument();
    expect(screen.getByText('15.1 kg CO₂e')).toBeInTheDocument();
    expect(
      screen.getByText(/Distance is a straight-line estimate, not exact road distance/),
    ).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('falls back to a local calculation and reports the backend error', async () => {
    const user = userEvent.setup();
    mocks.calculateCarbon.mockRejectedValue(new Error('Network down'));
    const { container } = render(<CarbonFootprintPage />);

    await fillRoute(user);
    await user.type(screen.getByLabelText('Distance (km)'), '50');
    await user.click(screen.getByRole('button', { name: /Bus/ }));
    await user.click(screen.getByRole('button', { name: 'Calculate Emissions' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Backend unavailable — used local calculation instead.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Network down');
    expect(screen.getByText('Emissions Calculated')).toBeInTheDocument();
    expect(screen.getByText('4.45')).toBeInTheDocument();
    expect(screen.getByText('5.15 kg CO₂e')).toBeInTheDocument();
    expect(screen.queryByText(/straight-line estimate/)).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('saves the calculated trip, reloads the log and clears the form', async () => {
    const user = userEvent.setup();
    mocks.listCarbonTrips.mockResolvedValueOnce([]).mockResolvedValueOnce([savedTrip]);
    const { container } = render(<CarbonFootprintPage />);

    await fillRoute(user);
    await user.click(screen.getByRole('button', { name: 'Calculate Emissions' }));
    expect(await screen.findByText('Emissions Calculated')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save to Log' }));

    await waitFor(() => expect(mocks.addCarbonTrip).toHaveBeenCalledTimes(1));
    expect(mocks.addCarbonTrip).toHaveBeenCalledWith('user-1', {
      origin: 'Gudur Station',
      destination: 'Nellore Office',
      distanceKm: 100,
      mode: 'Car',
      co2eKg: 4.1,
      date: '2026-01-15T09:00:00.000Z',
      savings: 0,
    });
    expect(await screen.findByText('Gudur Station → Nellore Office')).toBeInTheDocument();
    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    expect(screen.getByLabelText('From (Origin)')).toHaveValue('');
    expect(screen.getByLabelText('To (Destination)')).toHaveValue('');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('cancels a calculation without touching the trip log', async () => {
    const user = userEvent.setup();
    const { container } = render(<CarbonFootprintPage />);

    await fillRoute(user);
    await user.click(screen.getByRole('button', { name: 'Calculate Emissions' }));
    expect(await screen.findByText('Emissions Calculated')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Emissions Calculated')).not.toBeInTheDocument();
    expect(screen.getByText('No Calculation Active')).toBeInTheDocument();
    expect(mocks.addCarbonTrip).not.toHaveBeenCalled();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('removes a saved trip from the list and storage', async () => {
    const user = userEvent.setup();
    mocks.listCarbonTrips.mockResolvedValue([savedTrip]);
    const { container } = render(<CarbonFootprintPage />);

    const row = (await screen.findByText('Gudur Station → Nellore Office')).closest('tr');
    expect(row).not.toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Delete trip from Gudur Station to Nellore Office' }),
    );

    await waitFor(() => expect(mocks.deleteCarbonTrip).toHaveBeenCalledWith('user-1', 'trip-1'));
    await waitFor(() => expect(row).not.toBeInTheDocument());
    expect(screen.getByText('No trips saved yet.')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
