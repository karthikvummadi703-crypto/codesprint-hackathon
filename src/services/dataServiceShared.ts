/** Shared record types and local-storage helpers for data services. */
import type { ChatMessage, KnowledgeFile, TravelMode } from '../types';

export type Json = Record<string, unknown>;

export function isoNow(): string {
  return new Date().toISOString();
}

// ---- MOCK fallback store (used only when Firebase is not configured) ----
export const DEV_PREFIX = 'airguard_dev_data_';

export interface StoredRecord {
  id: string;
  [key: string]: unknown;
}

export interface ConversationRecord extends StoredRecord {
  title: string;
  updatedAt: string;
  createdAt: string;
}

export interface MessageRecord extends StoredRecord {
  role: ChatMessage['role'];
  content: string;
  timestamp: string;
}

export interface AirQualityRecord extends StoredRecord {
  timestamp: string;
  location?: string;
  aqi?: number;
  lat?: number;
  lon?: number;
}

export interface PredictionRecord extends StoredRecord {
  createdAt: string;
  predictions: unknown[];
}

export interface CarbonTripRecord extends StoredRecord {
  origin: string;
  destination: string;
  distanceKm: number;
  mode: TravelMode;
  co2eKg: number;
  date: string;
  savings?: number;
}

export interface UploadRecord extends Json {
  id?: string;
  fileId?: string;
  name: string;
  type: KnowledgeFile['type'];
  size: number;
  uploadedAt: string;
  status: KnowledgeFile['status'];
  ragFileId?: string;
}

export function devRead<T extends Json = Json>(uid: string, kind: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(`${DEV_PREFIX}${uid}_${kind}`) || '[]') as T[];
  } catch {
    return [];
  }
}

export function devWrite<T extends Json>(uid: string, kind: string, items: T[]) {
  localStorage.setItem(`${DEV_PREFIX}${uid}_${kind}`, JSON.stringify(items));
}
