import { API_BASE_URL } from './firebase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// GET responses that are safe to reuse briefly. Everything keyed on the signed-in
// user (their files, chat history) is excluded so switching accounts can never
// show the previous user's data.
const CACHE_TTL_MS = 60_000;
const NEVER_CACHE = /^\/api\/(ai\/chat|rag\/|auth\/)/;

type CacheEntry = { at: number; value: unknown };
const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** Drop cached GETs. Called on sign-out; location changes need no call because
 *  the cache key already carries the coordinates. */
export function clearResponseCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    inflight.clear();
    return;
  }
  for (const key of [...responseCache.keys()]) if (key.startsWith(prefix)) responseCache.delete(key);
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = 'GET', body, token, headers = {} } = options;

  const cacheable = method === 'GET' && !NEVER_CACHE.test(path);
  // Keyed by identity too, so a cached public lookup can never cross accounts.
  const key = `${token ?? 'anon'}|${path}`;

  if (cacheable) {
    const hit = responseCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
    // Coalesce: two components asking for the same location at the same time
    // share one request instead of racing each other.
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const h: Record<string, string> = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h['Authorization'] = `Bearer ${token}`;

  const run = (async () => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-error'));
      }
      let detail = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data && data.detail) detail = String(data.detail);
      } catch {
        // ignore parse error
      }
      throw new ApiError(detail, res.status);
    }

    if (res.status === 204) return undefined as T;
    const value = (await res.json()) as T;
    if (cacheable) responseCache.set(key, { at: Date.now(), value });
    return value;
  })();

  if (cacheable) {
    inflight.set(key, run);
    // Only a settled success is cached, so a failure always retries next time.
    run.catch(() => {}).finally(() => inflight.delete(key));
  }

  return run as Promise<T>;
}
