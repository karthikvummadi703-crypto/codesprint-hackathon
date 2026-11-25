/** Chat and retrieval-augmented upload endpoints. */
import { apiRequest } from '../apiClient';
import { API_BASE_URL } from '../firebase';
import type { Json } from '../../types';
import { authHeaders } from './shared';
import type { ChatResult } from './types';

export async function sendChatMessage(
  message: string,
  context?: {
    location?: { name?: string; latitude?: number; longitude?: number; region?: string; country?: string };
    aqHistory?: Json[];
    carbonTrips?: Json[];
    predictions?: Json[];
    weather?: Json;
    /**
     * Documents attached to this message. The backend resolves each id inside
     * the signed-in user's own knowledge base, so an id that belongs to someone
     * else simply matches nothing.
     */
    documentIds?: string[];
    history?: { role: 'user' | 'assistant'; content: string }[];
    household?: Record<string, unknown>;
    routines?: Record<string, unknown>[];
    routineContext?: string;
  },
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
      documentIds: context?.documentIds && context.documentIds.length > 0 ? context.documentIds : null,
      history: context?.history || null,
      household: context?.household || null,
      routines: context?.routines || null,
      routineContext: context?.routineContext || null,
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
  const res = await fetch(`${API_BASE_URL}/api/rag/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
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
