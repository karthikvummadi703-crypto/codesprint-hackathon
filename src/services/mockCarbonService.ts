import { CarbonTrip, TravelMode } from '../types';

export const CO2_FACTORS: Record<TravelMode, number> = {
  Car: 0.192,
  Bike: 0.103,
  Bus: 0.089,
  Train: 0.041,
  EV: 0.053,
  Walking: 0,
  Bicycle: 0,
};

export const TRAVEL_MODE_ICONS: Record<TravelMode, string> = {
  Car: '🚗',
  Bike: '🏍️',
  Bus: '🚌',
  Train: '🚆',
  EV: '⚡',
  Walking: '🚶',
  Bicycle: '🚴',
};

export function calculateCO2(distanceKm: number, mode: TravelMode): number {
  return Math.round(distanceKm * CO2_FACTORS[mode] * 100) / 100;
}

export const MOCK_RECENT_TRIPS: CarbonTrip[] = [
  {
    id: 't1',
    origin: 'Gudur',
    destination: 'Nellore',
    distanceKm: 42.5,
    mode: 'Train',
    co2eKg: 1.74,
    date: new Date(Date.now() - 86400000),
    savings: 6.38,
  },
  {
    id: 't2',
    origin: 'Gudur',
    destination: 'SPSR Nellore District Office',
    distanceKm: 12.8,
    mode: 'Car',
    co2eKg: 2.46,
    date: new Date(Date.now() - 172800000),
    savings: 0,
  },
  {
    id: 't3',
    origin: 'Home',
    destination: 'Local Market',
    distanceKm: 2.3,
    mode: 'Bicycle',
    co2eKg: 0,
    date: new Date(Date.now() - 259200000),
    savings: 0.44,
  },
  {
    id: 't4',
    origin: 'Gudur',
    destination: 'Chennai',
    distanceKm: 130.0,
    mode: 'Bus',
    co2eKg: 11.57,
    date: new Date(Date.now() - 432000000),
    savings: 13.43,
  },
];
