/** Carbon calculation requests to the backend. */
import { apiRequest } from './apiClient';
import { authHeaders } from './backendServiceClient';

export async function calculateCarbon(params: {
  origin: string;
  destination: string;
  distanceKm?: number;
  mode: string;
}): Promise<{
  distanceKm: number;
  co2eKg: number;
  mode: string;
  savings: number;
  estimated: boolean;
}> {
  const { token } = await authHeaders();
  const body: Record<string, unknown> = {
    origin: params.origin,
    destination: params.destination,
    mode: params.mode,
  };
  if (params.distanceKm !== undefined && params.distanceKm > 0) {
    body.distanceKm = params.distanceKm;
  }
  return apiRequest('/api/carbon/calculate', {
    method: 'POST',
    body,
    token,
  });
}

export async function estimateDistance(params: {
  origin: string;
  destination: string;
}): Promise<{ distanceKm: number }> {
  const { token } = await authHeaders();
  return apiRequest('/api/carbon/estimate-distance', {
    method: 'POST',
    body: { origin: params.origin, destination: params.destination },
    token,
  });
}
