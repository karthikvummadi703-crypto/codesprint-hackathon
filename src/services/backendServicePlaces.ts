/** Location search and reverse-geocoding requests. */
import { apiRequest } from './apiClient';
import { authHeaders } from './backendServiceClient';

export interface PlaceSuggestion {
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  country?: string;
  label?: string;
}

export async function searchLocations(query: string, limit = 5): Promise<PlaceSuggestion[]> {
  const { token } = await authHeaders();
  const q = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await apiRequest<{ places: PlaceSuggestion[] }>(
    `/api/geocode/search?${q.toString()}`,
    { token },
  );
  return data?.places ?? [];
}

export async function reverseGeocode(lat: number, lon: number): Promise<PlaceSuggestion> {
  const { token } = await authHeaders();
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  // The endpoint returns { places: [...] }, not a bare place.
  const data = await apiRequest<{ places?: PlaceSuggestion[] }>(
    `/api/geocode/reverse?${q.toString()}`,
    { token },
  );
  const place = data?.places?.[0];
  if (!place) throw new Error('Could not resolve this location.');
  return place;
}
