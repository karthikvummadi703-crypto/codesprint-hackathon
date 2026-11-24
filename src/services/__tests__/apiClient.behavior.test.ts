import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ API_BASE_URL: 'https://api.example' }));

import { ApiError, apiRequest, clearResponseCache } from '../apiClient';

const PATH = '/api/aqi?lat=1&lon=2';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('apiClient request behaviour', () => {
  let fetchMock: ReturnType<typeof vi.fn<(input: string, init?: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    clearResponseCache();
    fetchMock = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse({ aqi: 42 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    clearResponseCache();
    vi.unstubAllGlobals();
  });

  it('requests the configured base URL with default GET options', async () => {
    await apiRequest(PATH, { headers: { 'X-Trace': 'trace-1' } });

    expect(fetchMock).toHaveBeenCalledWith(`https://api.example${PATH}`, {
      method: 'GET',
      headers: { 'X-Trace': 'trace-1' },
      body: undefined,
    });
  });

  it('serializes a body and lets explicit auth and content headers be overridden', async () => {
    await apiRequest(PATH, {
      token: 'token-1',
      body: { message: 'hello' },
      headers: { Authorization: 'caller-value', 'Content-Type': 'text/plain', 'X-Trace': 'trace-2' },
    });

    expect(fetchMock.mock.calls[0]![1]).toEqual({
      method: 'GET',
      headers: {
        'X-Trace': 'trace-2',
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-1',
      },
      body: '{"message":"hello"}',
    });
  });

  it('dispatches an auth-error event on a 401 response', async () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener('auth-error', listener);
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Session expired' }, 401));

    await expect(apiRequest(PATH)).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0]).toBeInstanceOf(CustomEvent);
    expect((listener.mock.calls[0]![0] as CustomEvent).type).toBe('auth-error');
    window.removeEventListener('auth-error', listener);
  });

  it('falls back to a status message when the error body cannot be parsed', async () => {
    const json = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('bad json'));
    fetchMock.mockResolvedValue({ ok: false, status: 502, json } as unknown as Response);

    await expect(apiRequest(PATH)).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
      name: 'Error',
    });
    expect(json).toHaveBeenCalledOnce();
  });

  it('stringifies a non-string backend detail', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 4290 }, 429));

    await expect(apiRequest(PATH)).rejects.toMatchObject({ status: 429, message: '4290' });
  });

  it('returns undefined for a 204 without attempting to parse JSON', async () => {
    const json = vi.fn<() => Promise<unknown>>();
    fetchMock.mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);

    await expect(apiRequest(PATH)).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('expires cached GETs at the sixty-second boundary', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    fetchMock.mockResolvedValueOnce(jsonResponse({ aqi: 1 })).mockResolvedValueOnce(jsonResponse({ aqi: 2 }));

    await apiRequest(PATH);
    now.mockReturnValue(1_000_000 + 59_999);
    await expect(apiRequest<{ aqi: number }>(PATH)).resolves.toEqual({ aqi: 1 });
    now.mockReturnValue(1_000_000 + 60_000);
    await expect(apiRequest<{ aqi: number }>(PATH)).resolves.toEqual({ aqi: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears cached responses and pending requests on sign-out', async () => {
    let releaseFirst: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseFirst = resolve)));
    const first = apiRequest<{ value: number }>(PATH);

    clearResponseCache();
    fetchMock.mockResolvedValueOnce(jsonResponse({ value: 2 }));
    const second = apiRequest<{ value: number }>(PATH);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseFirst(jsonResponse({ value: 1 }));
    await expect(first).resolves.toEqual({ value: 1 });
    await expect(second).resolves.toEqual({ value: 2 });
  });

  it('matches a prefix against the full identity-prefixed cache key', async () => {
    await apiRequest(PATH);
    await apiRequest('/api/weather?city=Pune');

    clearResponseCache('/api/aqi');
    await apiRequest(PATH);
    await apiRequest('/api/weather?city=Pune');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    clearResponseCache('anon|/api/aqi');
    await apiRequest(PATH);
    await apiRequest('/api/weather?city=Pune');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares a failed in-flight GET but retries the next call', async () => {
    let release: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));

    const first = apiRequest(PATH);
    const second = apiRequest(PATH);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(jsonResponse({ detail: 'boom' }, 500));
    await expect(first).rejects.toMatchObject({ message: 'boom', status: 500 });
    await expect(second).rejects.toMatchObject({ message: 'boom', status: 500 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(apiRequest(PATH)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a newer forced request registered when an older request fails first', async () => {
    let releaseFirst: (response: Response) => void = () => {};
    let releaseForced: (response: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseFirst = resolve)))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseForced = resolve)));

    const first = apiRequest<{ value: number }>(PATH);
    const forced = apiRequest<{ value: number }>(PATH, { force: true });

    releaseFirst(jsonResponse({ detail: 'old request failed' }, 500));
    await expect(first).rejects.toMatchObject({ message: 'old request failed' });

    const coalesced = apiRequest<{ value: number }>(PATH);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseForced(jsonResponse({ value: 2 }));
    await expect(coalesced).resolves.toEqual({ value: 2 });
    await expect(forced).resolves.toEqual({ value: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets a superseded successful request leave a stale cache entry', async () => {
    let releaseFirst: (response: Response) => void = () => {};
    let releaseForced: (response: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseFirst = resolve)))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (releaseForced = resolve)));

    const first = apiRequest<{ value: number }>(PATH);
    const forced = apiRequest<{ value: number }>(PATH, { force: true });

    releaseFirst(jsonResponse({ value: 1 }));
    await expect(first).resolves.toEqual({ value: 1 });

    await expect(apiRequest<{ value: number }>(PATH)).resolves.toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseForced(jsonResponse({ value: 2 }));
    await expect(forced).resolves.toEqual({ value: 2 });
    await expect(apiRequest<{ value: number }>(PATH)).resolves.toEqual({ value: 2 });
  });

  it('never caches auth GETs or repeated POSTs', async () => {
    await apiRequest('/api/auth/session');
    await apiRequest('/api/auth/session');
    await apiRequest(PATH, { method: 'POST', body: { a: 1 } });
    await apiRequest(PATH, { method: 'POST', body: { a: 1 } });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not share an in-flight request between identities', async () => {
    let release: (response: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)))
      .mockResolvedValueOnce(jsonResponse({ aqi: 9 }));

    const anon = apiRequest(PATH);
    const signedIn = apiRequest(PATH, { token: 'token-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    release(jsonResponse({ aqi: 7 }));
    await expect(anon).resolves.toEqual({ aqi: 7 });
    await expect(signedIn).resolves.toEqual({ aqi: 9 });
  });
});
