/** Air-quality and prediction endpoints. */
import { apiRequest } from '../apiClient';
import type { AqiApiResponse, PredictionsApiResponse } from '../../types';
import { authHeaders, locationQuery } from './shared';

export async function fetchAQI(params: {
  lat?: number;
  lon?: number;
  city?: string;
  force?: boolean;
}): Promise<AqiApiResponse> {
  const { token } = await authHeaders();
  return apiRequest(`/api/aqi?${locationQuery(params).toString()}`, { token, force: params.force });
}

export async function fetchPredictions(params: {
  lat?: number;
  lon?: number;
  city?: string;
  days?: number;
  force?: boolean;
}): Promise<PredictionsApiResponse> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest(`/api/predictions?${query.toString()}`, { token, force: params.force });
}
