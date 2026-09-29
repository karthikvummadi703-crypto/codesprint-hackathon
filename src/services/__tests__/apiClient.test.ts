import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, clearResponseCache } from '../apiClient';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('apiRequest caching and coalescing', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearResponseCache();
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ aqi: 129 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearResponseCache();
  });

  it('serves a repeated GET from cache instead of refetching', async () => {
    const first = await apiRequest<{ aqi: number }>('/api/aqi?lat=1&lon=2');
    const second = await apiRequest<{ aqi: number }>('/api/aqi?lat=1&lon=2');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('coalesces concurrent identical GETs into one request', async () => {
    let release: (v: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (release = resolve))
    );

    const a = apiRequest('/api/aqi?lat=1&lon=2');
    const b = apiRequest('/api/aqi?lat=1&lon=2');
    const c = apiRequest('/api/aqi?lat=1&lon=2');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(jsonResponse({ aqi: 42 }));
    const [ra, rb, rc] = await Promise.all([a, b, c]);

    expect(ra).toEqual({ aqi: 42 });
    expect(rb).toBe(ra);
    expect(rc).toBe(ra);
  });

  it('does not share a cached entry between different locations', async () => {
    await apiRequest('/api/aqi?lat=1&lon=2');
    await apiRequest('/api/aqi?lat=9&lon=9');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not share a cached entry between different users', async () => {
    await apiRequest('/api/aqi?lat=1&lon=2', { token: 'user-a' });
    await apiRequest('/api/aqi?lat=1&lon=2', { token: 'user-b' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches chat, uploads or auth, which are per-user state', async () => {
    await apiRequest('/api/ai/chat', { method: 'POST', body: { message: 'hi' } });
    await apiRequest('/api/ai/chat', { method: 'POST', body: { message: 'hi' } });
    await apiRequest('/api/rag/files');
    await apiRequest('/api/rag/files');

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not cache a failure, so the next attempt really retries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: 'boom' }, 500));
    await expect(apiRequest('/api/aqi?lat=1&lon=2')).rejects.toThrow();

    await apiRequest('/api/aqi?lat=1&lon=2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears everything on sign-out', async () => {
    await apiRequest('/api/aqi?lat=1&lon=2');
    clearResponseCache();
    await apiRequest('/api/aqi?lat=1&lon=2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still surfaces an ApiError with its status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Too many requests.' }, 429));

    await expect(apiRequest('/api/aqi?lat=1&lon=2')).rejects.toMatchObject({
      status: 429,
      message: 'Too many requests.',
    });
  });
});
