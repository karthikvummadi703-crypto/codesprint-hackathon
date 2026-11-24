import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';

import type { ActiveLocation } from '../../../context/LocationContext';
import type { AppUser } from '../../../services/authService';
import type { ChatSession, KnowledgeFile } from '../../../types';
import { createSendMessage } from '../sendMessage';
import type { SendMessageContext } from '../sendMessage';
import type { AssistantReplyParams } from '../types';

const mocks = vi.hoisted(() => ({
  addMessage:
    vi.fn<
      (uid: string, convoId: string, msg: { role: 'user' | 'assistant'; content: string }) => Promise<void>
    >(),
  updateConversation: vi.fn<(uid: string, convoId: string, title: string) => Promise<void>>(),
  requestAssistantReply: vi.fn<(params: AssistantReplyParams) => Promise<string>>(),
  ensureSession: vi.fn<(uid: string, existingId: string) => Promise<string>>(),
  setSessions: vi.fn<(value: SetStateAction<ChatSession[]>) => void>(),
  setInputMessage: vi.fn<(value: SetStateAction<string>) => void>(),
  setPendingAttachment: vi.fn<(value: SetStateAction<KnowledgeFile | null>) => void>(),
  setAttachmentError: vi.fn<(value: SetStateAction<string>) => void>(),
  setIsLoading: vi.fn<(value: SetStateAction<boolean>) => void>(),
}));

vi.mock('../../../services/dataService', () => ({
  addMessage: mocks.addMessage,
  updateConversation: mocks.updateConversation,
}));

vi.mock('../requestAssistant', () => ({
  requestAssistantReply: mocks.requestAssistantReply,
}));

const user: AppUser = {
  uid: 'user-1',
  email: 'user@example.com',
  name: 'User',
  photoURL: null,
  isDev: false,
};

const location: ActiveLocation = { name: 'Delhi', latitude: 28.6, longitude: 77.2 };
const FIXED_NOW = Date.parse('2026-04-05T06:00:00.000Z');

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'conv-1',
    title: 'Existing chat',
    messages: [],
    createdAt: new Date(FIXED_NOW - 10_000),
    updatedAt: new Date(FIXED_NOW - 10_000),
    ...overrides,
  };
}

function makeContext(overrides: Partial<SendMessageContext> = {}): SendMessageContext {
  return {
    user,
    location,
    sessions: [makeSession()],
    currentSessionId: 'conv-1',
    pendingAttachment: null,
    lifestyle: null,
    isLoading: false,
    ensureSession: mocks.ensureSession,
    setSessions: mocks.setSessions,
    setInputMessage: mocks.setInputMessage,
    setPendingAttachment: mocks.setPendingAttachment,
    setAttachmentError: mocks.setAttachmentError,
    setIsLoading: mocks.setIsLoading,
    ...overrides,
  };
}

function resultingSessions(initial: ChatSession[]): ChatSession[] {
  let state = initial;
  for (const [update] of mocks.setSessions.mock.calls) {
    state = typeof update === 'function' ? update(state) : update;
  }
  return state;
}

describe('createSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(FIXED_NOW);
    mocks.ensureSession.mockResolvedValue('conv-1');
    mocks.requestAssistantReply.mockResolvedValue('Here is the answer.');
    mocks.addMessage.mockResolvedValue(undefined);
    mocks.updateConversation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing for blank input or while a send is already in flight', async () => {
    await createSendMessage(makeContext())('   ');
    await createSendMessage(makeContext({ isLoading: true }))('Question');

    expect(mocks.ensureSession).not.toHaveBeenCalled();
    expect(mocks.requestAssistantReply).not.toHaveBeenCalled();
    expect(mocks.setIsLoading).not.toHaveBeenCalled();
  });

  it('refuses to send when signed out or when the attachment is still indexing', async () => {
    const processing: KnowledgeFile = {
      id: 'file-1',
      name: 'report.pdf',
      type: 'pdf',
      size: 10,
      uploadedAt: new Date(FIXED_NOW),
      status: 'processing',
    };

    await createSendMessage(makeContext({ user: null }))('Question');
    await createSendMessage(makeContext({ pendingAttachment: processing }))('Question');

    expect(mocks.setAttachmentError).toHaveBeenNthCalledWith(1, 'Sign in to use the assistant.');
    expect(mocks.setAttachmentError).toHaveBeenNthCalledWith(
      2,
      'Wait for the document to finish uploading before asking about it.',
    );
    expect(mocks.ensureSession).not.toHaveBeenCalled();
    expect(mocks.requestAssistantReply).not.toHaveBeenCalled();
  });

  it('appends both turns with deterministic ids and best-effort history writes', async () => {
    const prior: ChatSession = makeSession({
      messages: [
        { id: 'old-1', role: 'assistant', content: 'Earlier answer', timestamp: new Date(FIXED_NOW - 5_000) },
      ],
    });
    const attachment: KnowledgeFile = {
      id: 'file-1',
      name: 'report.pdf',
      type: 'pdf',
      size: 10,
      uploadedAt: new Date(FIXED_NOW),
      status: 'ready',
      ragFileId: 'rag-9',
    };

    await createSendMessage(makeContext({ sessions: [prior], pendingAttachment: attachment }))('What now?');

    expect(mocks.ensureSession).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(mocks.requestAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'user-1',
        text: 'What now?',
        attachment,
        history: [
          { role: 'assistant', content: 'Earlier answer' },
          { role: 'user', content: 'What now?' },
        ],
        location,
      }),
    );
    expect(mocks.addMessage).toHaveBeenNthCalledWith(1, 'user-1', 'conv-1', {
      role: 'user',
      content: 'What now?',
    });
    expect(mocks.addMessage).toHaveBeenNthCalledWith(2, 'user-1', 'conv-1', {
      role: 'assistant',
      content: 'Here is the answer.',
    });
    expect(mocks.setInputMessage).toHaveBeenCalledWith('');
    expect(mocks.setPendingAttachment).toHaveBeenCalledWith(null);
    expect(mocks.setAttachmentError).toHaveBeenCalledWith('');
    expect(mocks.setIsLoading.mock.calls.map(([value]) => value)).toEqual([true, false]);
    const messages = resultingSessions([prior])[0]!.messages;
    expect(messages.map((message) => [message.id, message.role, message.content])).toEqual([
      ['old-1', 'assistant', 'Earlier answer'],
      [String(FIXED_NOW), 'user', 'What now?'],
      [String(FIXED_NOW + 1), 'assistant', 'Here is the answer.'],
    ]);
    expect(messages[1]?.timestamp).toEqual(new Date(FIXED_NOW));
    expect(mocks.updateConversation).not.toHaveBeenCalled();
  });

  it('renames a new persisted conversation from the first message', async () => {
    const fresh = makeSession({ title: 'New Conversation' });

    await createSendMessage(makeContext({ sessions: [fresh] }))('A'.repeat(40));

    const title = `${'A'.repeat(30)}...`;
    expect(mocks.updateConversation).toHaveBeenCalledWith('user-1', 'conv-1', title);
    expect(resultingSessions([fresh])[0]?.title).toBe(title);
  });

  it('keeps a local conversation usable without any Firestore writes', async () => {
    const local = makeSession({ id: 'local-abc', title: 'New Conversation' });
    mocks.ensureSession.mockResolvedValue('local-abc');

    await createSendMessage(
      makeContext({ sessions: [local], currentSessionId: '', ensureSession: mocks.ensureSession }),
    )('Hello');

    expect(mocks.ensureSession).toHaveBeenCalledWith('user-1', '');
    expect(mocks.addMessage).not.toHaveBeenCalled();
    expect(mocks.updateConversation).not.toHaveBeenCalled();
    expect(mocks.requestAssistantReply).toHaveBeenCalledTimes(1);
    expect(resultingSessions([local])[0]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('uses only the current question in history when the session is not in state', async () => {
    mocks.ensureSession.mockResolvedValue('created-later');

    await createSendMessage(
      makeContext({
        sessions: [makeSession()],
        currentSessionId: 'missing',
        ensureSession: mocks.ensureSession,
      }),
    )('Question');

    expect(mocks.requestAssistantReply).toHaveBeenCalledWith(
      expect.objectContaining({ history: [{ role: 'user', content: 'Question' }] }),
    );
  });

  it('swallows failed history writes and still shows the reply', async () => {
    const fresh = makeSession({ title: 'New Conversation' });
    mocks.addMessage.mockRejectedValue(new Error('write denied'));
    mocks.updateConversation.mockRejectedValue(new Error('write denied'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await createSendMessage(makeContext({ sessions: [fresh] }))('Question');

    expect(resultingSessions([fresh])[0]?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(mocks.setIsLoading.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it('limits the model history to the last ten turns', async () => {
    const prior = makeSession({
      messages: Array.from({ length: 12 }, (_, index) => ({
        id: `old-${index}`,
        role: 'user' as const,
        content: `m${index}`,
        timestamp: new Date(FIXED_NOW - 12_000 + index * 100),
      })),
    });

    await createSendMessage(makeContext({ sessions: [prior] }))('Now');

    const { history } = mocks.requestAssistantReply.mock.calls[0]![0];
    expect(history).toHaveLength(10);
    expect(history[0]).toEqual({ role: 'user', content: 'm3' });
    expect(history[9]).toEqual({ role: 'user', content: 'Now' });
  });

  it('shows an actionable hint for an unauthorized response', async () => {
    mocks.requestAssistantReply.mockRejectedValue(new Error('401 Unauthorized'));

    await createSendMessage(makeContext())('Question');

    const reply = resultingSessions([makeSession()])[0]!.messages[1]!;
    expect(reply.role).toBe('assistant');
    expect(reply.content).toContain('401 Unauthorized');
    expect(reply.content).toContain('Your session is no longer valid. Sign in again and retry.');
    expect(mocks.setIsLoading.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it('shows a backend hint for a network failure', async () => {
    mocks.requestAssistantReply.mockRejectedValue(new Error('Failed to fetch'));

    await createSendMessage(makeContext())('Question');

    expect(resultingSessions([makeSession()])[0]!.messages[1]?.content).toContain(
      'Could not reach the backend.',
    );
  });

  it('shows a generic hint for any other service failure', async () => {
    mocks.requestAssistantReply.mockRejectedValue(new Error('model unavailable'));

    await createSendMessage(makeContext())('Question');

    const content = resultingSessions([makeSession()])[0]!.messages[1]?.content;
    expect(content).toContain('model unavailable');
    expect(content).toContain('The AI service rejected the request. Check the backend logs for details.');
  });
});
