import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent, DragEvent, MouseEvent } from 'react';

import type { ActiveLocation } from '../../../context/LocationContext';
import type { AppUser } from '../../../services/authService';
import type {
  ChatMessage,
  ConversationRecord,
  Json,
  KnowledgeFile,
  MessageRecord,
  UploadRecord,
} from '../../../types';
import { useAssistant } from '../useAssistant';

const mocks = vi.hoisted(() => ({
  authUser: null as AppUser | null,
  location: null as ActiveLocation | null,
  listConversations: vi.fn<(uid: string) => Promise<ConversationRecord[]>>(),
  createConversation: vi.fn<(uid: string, title: string) => Promise<string>>(),
  deleteConversation: vi.fn<(uid: string, id: string) => Promise<void>>(),
  listMessages: vi.fn<(uid: string, id: string) => Promise<MessageRecord[]>>(),
  listUploads: vi.fn<(uid: string) => Promise<UploadRecord[]>>(),
  deleteUpload: vi.fn<(uid: string, id: string) => Promise<void>>(),
  getLifestyleSettings: vi.fn<(uid: string) => Promise<Json | null>>(),
  deleteRagFile: vi.fn<(id: string) => Promise<void>>(),
  deleteFromStorage: vi.fn<(path: string) => Promise<void>>(),
  uploadFilesForUser: vi.fn<(files: File[], user: AppUser, state: unknown) => Promise<KnowledgeFile[]>>(),
  createSendMessage: vi.fn<(context: unknown) => (text: string) => Promise<void>>(),
  sendHandler: vi.fn<(text: string) => Promise<void>>(),
  newLocalConvoId: vi.fn<() => string>(),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.authUser }),
}));

vi.mock('../../../context/LocationContext', () => ({
  useLocation: () => ({ location: mocks.location }),
}));

vi.mock('../../../services/dataService', () => ({
  listConversations: mocks.listConversations,
  createConversation: mocks.createConversation,
  deleteConversation: mocks.deleteConversation,
  listMessages: mocks.listMessages,
  listUploads: mocks.listUploads,
  deleteUpload: mocks.deleteUpload,
  getLifestyleSettings: mocks.getLifestyleSettings,
}));

vi.mock('../../../services/backendService', () => ({
  deleteRagFile: mocks.deleteRagFile,
}));

vi.mock('../../../services/storageService', () => ({
  deleteFromStorage: mocks.deleteFromStorage,
}));

vi.mock('../upload', () => ({
  uploadFilesForUser: mocks.uploadFilesForUser,
}));

vi.mock('../sendMessage', () => ({
  createSendMessage: mocks.createSendMessage,
}));

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants')>();
  return { ...actual, newLocalConvoId: mocks.newLocalConvoId };
});

const user: AppUser = {
  uid: 'user-1',
  email: 'user@example.com',
  name: 'User',
  photoURL: null,
  isDev: false,
};

function makeConvo(id: string, title = id): ConversationRecord {
  return {
    id,
    title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

function makeMessage(id: string, content: string, role: ChatMessage['role'] = 'user'): MessageRecord {
  return { id, role, content, timestamp: '2026-01-02T00:00:00.000Z' };
}

function makeUpload(overrides: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: 'u1',
    fileId: 'f1',
    name: 'report.pdf',
    type: 'pdf',
    size: 100,
    uploadedAt: '2026-01-02T00:00:00.000Z',
    status: 'ready',
    ragFileId: 'rag-1',
    ...overrides,
  };
}

function makeFile(overrides: Partial<KnowledgeFile> = {}): KnowledgeFile {
  return {
    id: 'f1',
    name: 'report.pdf',
    type: 'pdf',
    size: 100,
    uploadedAt: new Date('2026-01-02T00:00:00.000Z'),
    status: 'ready',
    ragFileId: 'rag-1',
    ...overrides,
  };
}

async function renderLoaded() {
  const view = renderHook(() => useAssistant());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

describe('useAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = user;
    mocks.location = { name: 'Delhi' };
    mocks.listConversations.mockResolvedValue([]);
    mocks.createConversation.mockResolvedValue('conv-created');
    mocks.deleteConversation.mockResolvedValue(undefined);
    mocks.listMessages.mockResolvedValue([]);
    mocks.listUploads.mockResolvedValue([]);
    mocks.deleteUpload.mockResolvedValue(undefined);
    mocks.getLifestyleSettings.mockResolvedValue(null);
    mocks.deleteRagFile.mockResolvedValue(undefined);
    mocks.deleteFromStorage.mockResolvedValue(undefined);
    mocks.uploadFilesForUser.mockResolvedValue([]);
    mocks.createSendMessage.mockReturnValue(mocks.sendHandler);
    mocks.sendHandler.mockResolvedValue(undefined);
    mocks.newLocalConvoId.mockReturnValue('local-fixed');
  });

  it('hydrates conversations, messages, uploads and lifestyle context', async () => {
    mocks.listConversations.mockResolvedValue([makeConvo('c1', 'Existing chat')]);
    mocks.listMessages.mockResolvedValue([makeMessage('m1', 'Earlier answer')]);
    mocks.listUploads.mockResolvedValue([makeUpload()]);
    mocks.getLifestyleSettings.mockResolvedValue({
      household: { members: [] },
      routines: [{ title: 'Filter' }],
      routinePromptContext: 'routine prompt',
    });

    const { result } = await renderLoaded();

    expect(result.current.sessions[0]?.id).toBe('c1');
    expect(result.current.currentSessionId).toBe('c1');
    expect(result.current.activeSession?.messages[0]?.content).toBe('Earlier answer');
    expect(result.current.activeSession?.messages[0]?.timestamp).toBeInstanceOf(Date);
    expect(result.current.uploadedFiles[0]).toMatchObject({ id: 'f1', name: 'report.pdf', status: 'ready' });
    expect(mocks.listMessages).toHaveBeenCalledWith('user-1', 'c1');
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.createSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        location: mocks.location,
        currentSessionId: 'c1',
        lifestyle: {
          household: { members: [] },
          routines: [{ title: 'Filter' }],
          routineContext: 'routine prompt',
        },
      }),
    );
  });

  it('creates a conversation when the user has none', async () => {
    const { result } = await renderLoaded();

    expect(mocks.createConversation).toHaveBeenCalledWith('user-1', 'New Conversation');
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({ id: 'conv-created', title: 'New Conversation' });
    expect(result.current.sessions[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.current.currentSessionId).toBe('conv-created');
  });

  it('still marks the hook as loaded when the initial load fails', async () => {
    mocks.listConversations.mockRejectedValue(new Error('firestore down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = await renderLoaded();

    expect(result.current.sessions).toEqual([]);
    expect(result.current.loaded).toBe(true);
    expect(console.error).toHaveBeenCalledWith('Failed to load conversations', expect.any(Error));
  });

  it('does not load anything while signed out', async () => {
    mocks.authUser = null;
    const { result } = renderHook(() => useAssistant());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.listConversations).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
  });

  it('creates and selects a new chat, but ignores the request when signed out', async () => {
    const { result, rerender } = await renderLoaded();
    mocks.createConversation.mockResolvedValue('conv-2');

    await act(async () => {
      await result.current.handleNewChat();
    });

    expect(result.current.currentSessionId).toBe('conv-2');
    expect(result.current.sessions.map((session) => session.id)).toEqual(['conv-2', 'conv-created']);
    expect(mocks.createConversation).toHaveBeenCalledTimes(2);

    mocks.authUser = null;
    rerender();
    await act(async () => {
      await result.current.handleNewChat();
    });
    expect(mocks.createConversation).toHaveBeenCalledTimes(2);
  });

  it('falls back to a local session when the conversation cannot be persisted', async () => {
    mocks.createConversation.mockRejectedValue(new Error('write denied'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.handleNewChat();
    });

    expect(result.current.currentSessionId).toBe('local-fixed');
    expect(result.current.sessions[0]?.id).toBe('local-fixed');
    expect(result.current.loaded).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      'Conversation could not be persisted, using a local one',
      expect.any(Error),
    );
  });

  it('deletes a session locally and remotely, then selects another session', async () => {
    mocks.listConversations.mockResolvedValue([makeConvo('c1', 'One'), makeConvo('c2', 'Two')]);
    const { result } = await renderLoaded();
    const event = { stopPropagation: vi.fn() } as unknown as MouseEvent;

    await act(async () => {
      await result.current.handleDeleteSession('c1', event);
    });

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(result.current.sessions.map((session) => session.id)).toEqual(['c2']);
    expect(result.current.currentSessionId).toBe('c2');
    expect(mocks.deleteConversation).toHaveBeenCalledWith('user-1', 'c1');

    await act(async () => {
      await result.current.handleDeleteSession('local-ignored', event);
    });
    expect(mocks.deleteConversation).not.toHaveBeenCalledWith('user-1', 'local-ignored');

    mocks.deleteConversation.mockRejectedValueOnce(new Error('denied'));
    await act(async () => {
      await result.current.handleDeleteSession('c2', event);
    });
    expect(result.current.sessions).toEqual([]);
    expect(result.current.currentSessionId).toBe('');
  });

  it('only attaches documents that have finished indexing', async () => {
    const { result } = await renderLoaded();
    const ready = makeFile();

    act(() => result.current.attachFile(ready));
    expect(result.current.pendingAttachment).toBe(ready);
    expect(result.current.attachmentError).toBe('');

    act(() => result.current.attachFile(makeFile({ id: 'f2', status: 'processing' })));
    expect(result.current.pendingAttachment).toBe(ready);
    expect(result.current.attachmentError).toBe('That document is still being indexed.');
  });

  it('uploads selected files, resets the input and guards empty or signed-out uploads', async () => {
    const { result, rerender } = await renderLoaded();
    const file = new File(['data'], 'notes.txt', { type: 'text/plain' });
    const target: { files: File[] | null; value: string } = {
      files: [file],
      value: 'C:\\fakepath\\notes.txt',
    };

    await act(async () => {
      await result.current.handleFileUpload({ target } as unknown as ChangeEvent<HTMLInputElement>);
    });

    expect(target.value).toBe('');
    expect(mocks.uploadFilesForUser).toHaveBeenCalledWith(
      [file],
      user,
      expect.objectContaining({
        setUploadedFiles: expect.any(Function),
        setUploadProgress: expect.any(Function),
        setAttachmentError: expect.any(Function),
      }),
    );

    target.value = 'unchanged';
    target.files = null;
    await act(async () => {
      await result.current.handleFileUpload({ target } as unknown as ChangeEvent<HTMLInputElement>);
    });
    expect(mocks.uploadFilesForUser).toHaveBeenCalledTimes(1);
    expect(target.value).toBe('unchanged');

    mocks.authUser = null;
    rerender();
    target.files = [file];
    await act(async () => {
      await result.current.handleFileUpload({ target } as unknown as ChangeEvent<HTMLInputElement>);
    });
    expect(mocks.uploadFilesForUser).toHaveBeenCalledTimes(1);
  });

  it('stages the first ready dropped document and ignores empty drops', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setDragActive(true));
    const ready = makeFile();
    mocks.uploadFilesForUser.mockResolvedValueOnce([makeFile({ id: 'f2', status: 'error' }), ready]);
    const dropped = new File(['data'], 'report.pdf');
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { files: [dropped] },
    } as unknown as DragEvent;

    await act(async () => {
      await result.current.handleDrop(event);
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.dragActive).toBe(false);
    expect(mocks.uploadFilesForUser).toHaveBeenCalledWith([dropped], user, expect.any(Object));
    expect(result.current.pendingAttachment).toBe(ready);

    const emptyDrop = { preventDefault: vi.fn(), dataTransfer: { files: [] } } as unknown as DragEvent;
    await act(async () => {
      await result.current.handleDrop(emptyDrop);
    });
    expect(mocks.uploadFilesForUser).toHaveBeenCalledTimes(1);
  });

  it('deletes a document from state, the composer and every backend', async () => {
    mocks.listUploads.mockResolvedValue([makeUpload()]);
    const { result, rerender } = await renderLoaded();
    const file = result.current.uploadedFiles[0]!;
    act(() => result.current.attachFile(file));

    await act(async () => {
      await result.current.handleDeleteFile(file);
    });

    expect(result.current.uploadedFiles).toEqual([]);
    expect(result.current.pendingAttachment).toBeNull();
    expect(mocks.deleteRagFile).toHaveBeenCalledWith('rag-1');
    expect(mocks.deleteFromStorage).toHaveBeenCalledWith('users/user-1/uploads/report.pdf');
    expect(mocks.deleteUpload).toHaveBeenCalledWith('user-1', 'f1');

    mocks.authUser = null;
    rerender();
    await act(async () => {
      await result.current.handleDeleteFile(file);
    });
    expect(mocks.deleteUpload).toHaveBeenCalledTimes(1);
  });

  it('filters sessions by title without regard to case', async () => {
    mocks.listConversations.mockResolvedValue([makeConvo('c1', 'Morning AQI'), makeConvo('c2', 'Trips')]);
    const { result } = await renderLoaded();
    expect(result.current.filteredSessions).toHaveLength(2);

    act(() => result.current.setSearchQuery('MORNING'));
    expect(result.current.filteredSessions.map((session) => session.id)).toEqual(['c1']);

    act(() => result.current.setSearchQuery('missing'));
    expect(result.current.filteredSessions).toEqual([]);
  });

  it('wires the send handler to the current hook state', async () => {
    const { result } = await renderLoaded();

    expect(mocks.createSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        location: mocks.location,
        sessions: result.current.sessions,
        currentSessionId: result.current.currentSessionId,
        pendingAttachment: null,
        isLoading: false,
        ensureSession: expect.any(Function),
      }),
    );

    await act(async () => {
      await result.current.handleSendMessage('Hello');
    });
    expect(mocks.sendHandler).toHaveBeenCalledWith('Hello');
  });
});
