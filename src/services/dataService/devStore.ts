/** Mock-store helpers used by every data-service shard. */
import type { PredictionRecord, StoredRecord } from '../../types';

export type P = PredictionRecord;

export function isoNow(): string {
  return new Date().toISOString();
}

// ---- MOCK fallback store (used only when Firebase is not configured) ----
export const DEV_PREFIX = 'airguard_dev_data_';

export function devRead<T extends StoredRecord = StoredRecord>(uid: string, kind: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(`${DEV_PREFIX}${uid}_${kind}`) || '[]') as T[];
  } catch {
    return [];
  }
}

export function devWrite<T extends StoredRecord>(uid: string, kind: string, items: T[]): void {
  localStorage.setItem(`${DEV_PREFIX}${uid}_${kind}`, JSON.stringify(items));
}
