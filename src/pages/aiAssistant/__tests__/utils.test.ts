import { describe, expect, it } from 'vitest';

import { toChatMessage, toKnowledgeFile } from '../utils';

describe('toChatMessage', () => {
  it('hydrates the timestamp and preserves the role', () => {
    const message = toChatMessage({
      id: 'm1',
      role: 'assistant',
      content: 'Wear a mask.',
      timestamp: '2026-01-15T08:30:00.000Z',
    });

    expect(message.timestamp).toBeInstanceOf(Date);
    expect(message.timestamp.toISOString()).toBe('2026-01-15T08:30:00.000Z');
    expect(message.role).toBe('assistant');
  });
});

describe('toKnowledgeFile', () => {
  it('prefers fileId, defaults size and status, and keeps the rag id', () => {
    const file = toKnowledgeFile({
      id: 'legacy-id',
      fileId: 'file-id',
      name: 'aqi.pdf',
      type: 'pdf',
      uploadedAt: '2026-01-15T08:30:00.000Z',
      ragFileId: 'rag-1',
    });

    expect(file.id).toBe('file-id');
    expect(file.size).toBe(0);
    expect(file.status).toBe('ready');
    expect(file.ragFileId).toBe('rag-1');
  });

  it('falls back to id and omits a missing rag id', () => {
    const file = toKnowledgeFile({
      id: 'only-id',
      name: 'trips.csv',
      type: 'csv',
      size: '128',
      uploadedAt: '2026-01-15T08:30:00.000Z',
      status: 'processing',
    });

    expect(file.id).toBe('only-id');
    expect(file.size).toBe(128);
    expect(file.status).toBe('processing');
    expect(file.ragFileId).toBeUndefined();
  });
});
