import { calculateCO2 } from '../../services/carbonConstants';
import type { CarbonTripRecord } from '../../services/dataServiceShared';
import { CarbonTrip, TravelMode } from '../../types';

export const TRAVEL_MODES: TravelMode[] = [
  'Car',
  'Bike',
  'Bus',
  'Train',
  'EV',
  'Walking',
  'Bicycle',
];

export function toCarbonTrip(raw: CarbonTripRecord): CarbonTrip {
  return {
    id: raw.id,
    origin: raw.origin,
    destination: raw.destination,
    distanceKm: Number(raw.distanceKm || 0),
    mode: raw.mode as TravelMode,
    co2eKg: Number(raw.co2eKg || 0),
    date: new Date(raw.date),
    savings: raw.savings !== undefined && raw.savings !== null ? Number(raw.savings) : undefined,
  };
}

export function savingsVsCar(distanceKm: number, co2eKg: number): number | undefined {
  const avgCarCo2 = calculateCO2(distanceKm, 'Car');
  const savings = Math.max(0, Math.round((avgCarCo2 - co2eKg) * 100) / 100);
  return savings > 0 ? savings : undefined;
}

interface CreateTripInput {
  origin: string;
  destination: string;
  distanceKm: number;
  mode: TravelMode;
  co2eKg: number;
  savingsBaseKm: number;
}

export function createTrip(input: CreateTripInput): CarbonTrip {
  const savings = savingsVsCar(input.savingsBaseKm, input.co2eKg);
  return {
    id: Date.now().toString(),
    origin: input.origin,
    destination: input.destination,
    distanceKm: input.distanceKm,
    mode: input.mode,
    co2eKg: input.co2eKg,
    date: new Date(),
    savings,
  };
}
