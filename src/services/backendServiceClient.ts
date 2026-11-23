/** Shared auth and query helpers for backend service modules. */
import { apiRequest } from './apiClient';
import { getAppToken } from './authService';

export async function authHeaders(): Promise<{ token: string | null }> {
  return { token: await getAppToken() };
}

export function locationQuery(params: {
  lat?: number;
  lon?: number;
  city?: string;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (params.lat !== undefined) query.set('lat', String(params.lat));
  if (params.lon !== undefined) query.set('lon', String(params.lon));
  if (params.city) query.set('city', params.city);
  return query;
}

export async function backendHealth(): Promise<boolean> {
  try {
    await apiRequest('/api/health');
    return true;
  } catch {
    return false;
  }
}
