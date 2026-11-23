import type { ActiveLocation } from '../../context/LocationContext';
import type { PlaceSuggestion } from '../../services/backendService';

export function toActiveLocation(s: PlaceSuggestion): ActiveLocation {
  return {
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    region: s.region,
    country: s.country,
  };
}

export function geocodedLocation(
  latitude: number,
  longitude: number,
  place: Pick<PlaceSuggestion, 'name' | 'region' | 'country'>,
): ActiveLocation {
  return {
    name: [place.name, place.region, place.country].filter(Boolean).join(', ') || 'My location',
    latitude,
    longitude,
    region: place.region,
    country: place.country,
  };
}

export function fallbackLocation(coords: GeolocationCoordinates): ActiveLocation {
  return { name: 'My location', latitude: coords.latitude, longitude: coords.longitude };
}
