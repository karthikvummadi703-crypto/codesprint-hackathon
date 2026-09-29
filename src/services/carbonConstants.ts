import { TravelMode } from '../types';

/**
 * Reference emission factors (kg CO2e per passenger-km).
 *
 * These are the fallback comparison values shown in the UI. The authoritative
 * figure for a saved trip is the one the backend returns from /api/carbon.
 */
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
