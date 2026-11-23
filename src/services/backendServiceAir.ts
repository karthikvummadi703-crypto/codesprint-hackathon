/** Air-quality and prediction requests to the backend. */
import { apiRequest } from './apiClient';
import { authHeaders, locationQuery } from './backendServiceClient';

/** Values of `method` returned by /api/predictions. Keep in sync with backend/api/air.py. */
export const PREDICTION_METHOD = {
  MODEL: 'provider-forecast',
  HEURISTIC: 'heuristic-prototype',
} as const;

export async function fetchAQI(params: {
  lat?: number;
  lon?: number;
  city?: string;
  force?: boolean;
}): Promise<Record<string, unknown>> {
  const { token } = await authHeaders();
  return apiRequest(`/api/aqi?${locationQuery(params).toString()}`, { token, force: params.force });
}

export async function fetchPredictions(params: {
  lat?: number;
  lon?: number;
  city?: string;
  days?: number;
  force?: boolean;
}): Promise<Record<string, unknown>> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest(`/api/predictions?${query.toString()}`, { token, force: params.force });
}
