/** Assistant chat requests to the backend. */
import { apiRequest } from './apiClient';
import { authHeaders } from './backendServiceClient';
import type { Json } from './dataServiceShared';

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
    location?: {
      name?: string;
      latitude?: number;
      longitude?: number;
      region?: string;
      country?: string;
    };
    aqHistory?: unknown[];
    carbonTrips?: unknown[];
    predictions?: unknown[];
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
      documentIds:
        context?.documentIds && context.documentIds.length > 0 ? context.documentIds : null,
      history: context?.history || null,
      household: context?.household || null,
      routines: context?.routines || null,
      routineContext: context?.routineContext || null,
    },
    token,
  });
}
