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
  const query = new URLSearchParams();
  if (params.lat !== undefined) query.set('lat', String(params.lat));
  if (params.lon !== undefined) query.set('lon', String(params.lon));
  if (params.city) query.set('city', params.city);
  return apiRequest(`/api/aqi?${query.toString()}`, { token });
}

export async function fetchPredictions(params: {
  lat?: number;
  lon?: number;
  city?: string;
}): Promise<Record<string, any>> {
  const { token } = await authHeaders();
  const query = new URLSearchParams();
  if (params.lat !== undefined) query.set('lat', String(params.lat));
  if (params.lon !== undefined) query.set('lon', String(params.lon));
  if (params.city) query.set('city', params.city);
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
  return apiRequest<PlaceSuggestion>(`/api/geocode/reverse?${q.toString()}`, { token });
}

export async function sendChatMessage(
  message: string,
  context?: { aqHistory?: any[]; carbonTrips?: any[]; predictions?: any[]; currentLocation?: string }
): Promise<{ response: string; contextUsed?: boolean }> {
  const { token } = await authHeaders();
  return apiRequest<{ response: string; contextUsed?: boolean }>('/api/ai/chat', {
    method: 'POST',
    body: {
      message,
      aqHistory: context?.aqHistory || null,
      carbonTrips: context?.carbonTrips || null,
      predictions: context?.predictions || null,
      currentLocation: context?.currentLocation || null,
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

export async function backendHealth(): Promise<boolean> {
  try {
    await apiRequest('/api/health');
    return true;
  } catch {
    return false;
  }
}
