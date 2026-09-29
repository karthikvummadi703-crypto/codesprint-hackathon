import { apiRequest } from './apiClient';
import { API_BASE_URL } from './firebase';
import { getAppToken } from './authService';

async function authHeaders(): Promise<{ token: string | null }> {
  return { token: await getAppToken() };
}

export async function fetchAQI(params: {
  lat?: number;
  lon?: number;
  city?: string;
}): Promise<Record<string, any>> {
  const { token } = await authHeaders();
  return apiRequest(`/api/aqi?${locationQuery(params).toString()}`, { token });
}

export async function fetchPredictions(params: {
  lat?: number;
  lon?: number;
  city?: string;
  days?: number;
}): Promise<Record<string, any>> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest(`/api/predictions?${query.toString()}`, { token });
}

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
  const data = await apiRequest<{ places: PlaceSuggestion[] }>(`/api/geocode/search?${q.toString()}`, { token });
  return data?.places ?? [];
}

export async function reverseGeocode(lat: number, lon: number): Promise<PlaceSuggestion> {
  const { token } = await authHeaders();
  const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  // The endpoint returns { places: [...] }, not a bare place.
  const data = await apiRequest<{ places?: PlaceSuggestion[] }>(
    `/api/geocode/reverse?${q.toString()}`,
    { token }
  );
  const place = data?.places?.[0];
  if (!place) throw new Error('Could not resolve this location.');
  return place;
}

export interface ChatResult {
  response: string;
  contextUsed?: boolean;
  intent?: string;
  contextSections?: string[];
  provider?: string;
  latencyMs?: number;
  degraded?: boolean;
  dataCoverage?: Record<string, boolean>;
}

export async function sendChatMessage(
  message: string,
  context?: {
    location?: { name?: string; latitude?: number; longitude?: number; region?: string; country?: string };
    aqHistory?: any[];
    carbonTrips?: any[];
    predictions?: any[];
    weather?: any;
    /**
     * Documents attached to this message. The backend resolves each id inside
     * the signed-in user's own knowledge base, so an id that belongs to someone
     * else simply matches nothing.
     */
    documentIds?: string[];
    history?: { role: 'user' | 'assistant'; content: string }[];
  }
): Promise<ChatResult> {
  const { token } = await authHeaders();
  return apiRequest<ChatResult>('/api/ai/chat', {
    method: 'POST',
    body: {
      message,
      location: context?.location || null,
      aqHistory: context?.aqHistory || null,
      carbonTrips: context?.carbonTrips || null,
      predictions: context?.predictions || null,
      weather: context?.weather || null,
      documentIds:
        context?.documentIds && context.documentIds.length > 0 ? context.documentIds : null,
      history: context?.history || null,
    },
    token,
  });
}

export async function uploadDocumentForRag(file: File): Promise<{
  fileId: string;
  fileName: string;
  chunkCount: number;
  textPreview: string;
}> {
  const { token } = await authHeaders();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(
    `${API_BASE_URL}/api/rag/upload`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }
  );
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.detail) detail = String(data.detail);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return await res.json();
}

export async function deleteRagFile(fileId: string): Promise<void> {
  const { token } = await authHeaders();
  await apiRequest(`/api/rag/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    token,
  });
}

export async function calculateCarbon(params: {
  origin: string;
  destination: string;
  distanceKm?: number;
  mode: string;
}): Promise<{ distanceKm: number; co2eKg: number; mode: string; savings: number; estimated: boolean }> {
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
  location: { name: string; latitude: number; longitude: number; region?: string; country?: string };
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  units: Record<string, string>;
  source: string;
  timezone: string;
  timestamp: string;
}

function locationQuery(params: { lat?: number; lon?: number; city?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.lat !== undefined) query.set('lat', String(params.lat));
  if (params.lon !== undefined) query.set('lon', String(params.lon));
  if (params.city) query.set('city', params.city);
  return query;
}

export async function fetchWeather(params: {
  lat?: number;
  lon?: number;
  city?: string;
  hours?: number;
  days?: number;
}): Promise<WeatherResponse> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.hours !== undefined) query.set('hours', String(params.hours));
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest<WeatherResponse>(`/api/weather?${query.toString()}`, { token });
}

export async function fetchWeatherSummary(params: {
  lat?: number;
  lon?: number;
  city?: string;
  days?: number;
}): Promise<{ summary: string; location: string; source: string; timestamp: string }> {
  const { token } = await authHeaders();
  const query = locationQuery(params);
  if (params.days !== undefined) query.set('days', String(params.days));
  return apiRequest(`/api/weather/summary?${query.toString()}`, { token });
}

export async function backendHealth(): Promise<boolean> {
  try {
    await apiRequest('/api/health');
    return true;
  } catch {
    return false;
  }
}
