import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearResponseCache } from '../apiClient';
import {
  deleteRagFile,
  sendChatMessage,
  uploadDocumentForRag,
} from '../backendService';

const mocks = vi.hoisted(() => ({
  getAppToken: vi.fn(),
}));

vi.mock('../authService', () => ({ getAppToken: mocks.getAppToken }));
vi.mock('../firebase', () => ({ API_BASE_URL: 'https://transport.example.test' }));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearResponseCache();
  mocks.getAppToken.mockResolvedValue('token-42');
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({ response: 'ok' }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  clearResponseCache();
  vi.unstubAllGlobals();
});

describe('sendChatMessage transport', () => {
  it('posts one JSON request per message with the current bearer token', async () => {
    await expect(sendChatMessage('What is the AQI?')).resolves.toEqual({ response: 'ok' });
    await sendChatMessage('What is the AQI?');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe('https://transport.example.test/api/ai/chat');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-42',
      });
      expect(JSON.parse(init?.body as string)).toMatchObject({
        message: 'What is the AQI?',
        documentIds: null,
      });
    }
  });

  it('allows a retry after a rejected chat request without reusing a cached failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'Backend busy.' }, 503))
      .mockResolvedValueOnce(jsonResponse({ response: 'Recovered', intent: 'status' }));

    await expect(sendChatMessage('Try again')).rejects.toMatchObject({
      message: 'Backend busy.',
      status: 503,
    });
    await expect(sendChatMessage('Try again')).resolves.toMatchObject({
      response: 'Recovered',
      intent: 'status',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('signals an expired session on a 401 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Unauthorized' }, 401));
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    await expect(sendChatMessage('Hi')).rejects.toMatchObject({ status: 401 });

    expect(dispatch).toHaveBeenCalledWith(new CustomEvent('auth-error'));
  });

  it('carries exactly the document id chosen for the message', async () => {
    await sendChatMessage('Read this', { documentIds: ['rag-9'] });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      message: 'Read this',
      documentIds: ['rag-9'],
    });
  });
});

describe('uploadDocumentForRag transport', () => {
  const file = () => new File(['report text'], 'report.txt', { type: 'text/plain' });

  it('uploads multipart data and returns the indexing result', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ fileId: 'rag-1', fileName: 'report.txt', chunkCount: 2, textPreview: 'report' })
    );

    await expect(uploadDocumentForRag(file())).resolves.toEqual({
      fileId: 'rag-1',
      fileName: 'report.txt',
      chunkCount: 2,
      textPreview: 'report',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://transport.example.test/api/rag/upload');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer token-42' });
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('sends no bearer header when there is no app token', async () => {
    mocks.getAppToken.mockResolvedValue(null);

    await uploadDocumentForRag(file());

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });

  it('can retry an upload after a validation failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'File too large' }, 413))
      .mockResolvedValueOnce(jsonResponse({ fileId: 'rag-2' }));

    await expect(uploadDocumentForRag(file())).rejects.toThrow('File too large');

    await expect(uploadDocumentForRag(file())).resolves.toEqual({ fileId: 'rag-2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a network error for the caller to display', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));

    await expect(uploadDocumentForRag(file())).rejects.toThrow('Failed to fetch');
  });
});

describe('deleteRagFile transport', () => {
  it('issues an authenticated DELETE with an encoded file id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 204));

    await expect(deleteRagFile('my folder/report.pdf')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://transport.example.test/api/rag/files/my%20folder%2Freport.pdf');
    expect(init?.method).toBe('DELETE');
    expect(init?.headers).toEqual({ Authorization: 'Bearer token-42' });
  });
});
