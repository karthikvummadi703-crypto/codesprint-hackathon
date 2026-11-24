import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { ChatMessage, KnowledgeFile, MessageRecord, UploadRecord } from '../../../types';
import { toChatMessage, toKnowledgeFile } from '../utils';

fc.configureGlobal({ numRuns: 100, seed: 20261126 });

const roleArb: fc.Arbitrary<ChatMessage['role']> = fc.constantFrom('user', 'assistant');
const typeArb: fc.Arbitrary<KnowledgeFile['type']> = fc.constantFrom('pdf', 'csv', 'txt');

const timestampMsArb = fc.integer({ min: 0, max: 4102444800000 });

const optionalIdArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.string({ maxLength: 12 }),
);

const statusArb: fc.Arbitrary<KnowledgeFile['status'] | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom<KnowledgeFile['status']>('processing', 'ready', 'error'),
);

const sizeArb: fc.Arbitrary<number | string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: -1000, max: 100000 }),
  fc.string({ maxLength: 12 }),
);

describe('toChatMessage properties', () => {
  it('preserves fields and hydrates the exact timestamp for valid records', () => {
    fc.assert(
      fc.property(fc.string(), roleArb, fc.string(), timestampMsArb, (id, role, content, ms) => {
        const raw: MessageRecord = {
          id,
          role,
          content,
          timestamp: new Date(ms).toISOString(),
        };
        const message = toChatMessage(raw);

        expect(message.id).toBe(id);
        expect(message.role).toBe(role);
        expect(message.content).toBe(content);
        expect(message.timestamp).toBeInstanceOf(Date);
        expect(message.timestamp.getTime()).toBe(ms);
      }),
    );
  });

  it('keeps an invalid timestamp as an Invalid Date instead of falling back', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), (suffix) => {
        const message = toChatMessage({
          id: 'message-id',
          role: 'user',
          content: '',
          timestamp: 'not-a-timestamp-' + suffix,
        });
        expect(message.timestamp.getTime()).toBeNaN();
      }),
    );
  });
});

describe('toKnowledgeFile properties', () => {
  it('applies the exact id, size, status and rag defaults', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 12 }),
        optionalIdArb,
        fc.string({ maxLength: 12 }),
        typeArb,
        sizeArb,
        timestampMsArb,
        statusArb,
        optionalIdArb,
        (id, fileId, name, type, size, ms, status, ragFileId) => {
          const raw: UploadRecord = {
            id,
            fileId,
            name,
            type,
            size,
            uploadedAt: new Date(ms).toISOString(),
            status,
            ragFileId,
          };
          const file = toKnowledgeFile(raw);

          expect(file.id).toBe(fileId || id);
          expect(file.name).toBe(name);
          expect(file.type).toBe(type);
          expect(file.size).toBe(Number(size || 0));
          expect(file.uploadedAt.getTime()).toBe(ms);
          expect(file.status).toBe(status || 'ready');
          expect(file.ragFileId).toBe(ragFileId || undefined);
        },
      ),
    );
  });

  it('converts numeric strings to numbers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999999 }), (size) => {
        const file = toKnowledgeFile({
          id: 'file-id',
          name: 'readings.csv',
          type: 'csv',
          size: String(size),
          uploadedAt: '2026-01-01T00:00:00.000Z',
        });
        expect(file.size).toBe(size);
      }),
    );
  });

  it('keeps NaN for non-numeric size strings', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z]{1,8}$/), (size) => {
        const file = toKnowledgeFile({
          id: 'file-id',
          name: 'notes.txt',
          type: 'txt',
          size,
          uploadedAt: '2026-01-01T00:00:00.000Z',
        });
        expect(file.size).toBeNaN();
      }),
    );
  });
});
