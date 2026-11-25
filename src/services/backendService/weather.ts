/** Weather forecast and summary endpoints. */
import { apiRequest } from '../apiClient';
import { authHeaders, locationQuery } from './shared';
import type { WeatherResponse } from './types';

export async function fetchWeather(params: {
  lat?: number;
  lon?: number;
  city?: string;
  hours?: number;
  days?: number;
  force?: boolean;
}): Promise<WeatherResponse> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.hours !== undefined) query.set('hours', String(params.hours));
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest<WeatherResponse>(`/api/weather?${query.toString()}`, { token, force: params.force });
}

export async function fetchWeatherSummary(params: {
  lat?: number;
  lon?: number;
  city?: string;
  days?: number;
  force?: boolean;
}): Promise<{ summary: string; location: string; source: string; timestamp: string }> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest(`/api/weather/summary?${query.toString()}`, { token, force: params.force });
}
