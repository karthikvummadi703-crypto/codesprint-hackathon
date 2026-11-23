/** Weather and weather-summary requests to the backend. */
import { apiRequest } from './apiClient';
import { authHeaders, locationQuery } from './backendServiceClient';

export interface CurrentWeather {
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitation: number | null;
  cloudCover: number | null;
  pressure: number | null;
  uvIndex: number | null;
  visibility: number | null;
  isDay: boolean;
  condition: string;
  conditionCode: number;
  observedAt: string;
  precipitationProbability: number | null;
}

export interface HourlyWeather {
  timestamp: string;
  localTime: string;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number;
  precipitation: number | null;
  precipitationProbability: number;
  windSpeed: number | null;
  windDirection: number;
  cloudCover: number;
  uvIndex: number | null;
  condition: string;
  conditionCode: number;
}

export interface DailyWeather {
  date: string;
  condition: string;
  conditionCode: number;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationSum: number | null;
  precipitationProbabilityMax: number;
  windSpeedMax: number | null;
  windDirectionDominant: number;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherResponse {
  location: {
    name: string;
    latitude: number;
    longitude: number;
    region?: string;
    country?: string;
  };
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  units: Record<string, string>;
  source: string;
  timezone: string;
  timestamp: string;
}

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
  return apiRequest<WeatherResponse>(`/api/weather?${query.toString()}`, {
    token,
    force: params.force,
  });
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
