import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CREATED_AT,
  expectChatRequest,
  fetchMock,
  firebaseState,
  firestore,
  installAssistantHarness,
  localStorageMock,
  network,
  PREFIX,
  readStored,
  seedChatFixture,
  seedConversation,
  store,
  UID,
} from './support';
import { useAssistant } from '../useAssistant';

installAssistantHarness();

describe('useAssistant hydration', () => {
  it('hydrates conversations, messages, uploads and lifestyle from local storage', async () => {
    seedConversation();
    store.set(
      `${PREFIX}${UID}_uploads`,
      JSON.stringify([
        {
          fileId: 'rag-9',
          name: 'report.pdf',
          type: 'pdf',
          size: 2048,
          uploadedAt: CREATED_AT,
          status: 'ready',
        },
      ]),
    );
    store.set(
      `${PREFIX}${UID}_lifestyle`,
      JSON.stringify({
        household: { members: [] },
        routines: [],
        routinePromptContext: 'Saved context',
      }),
    );

    const { result } = renderHook(() => useAssistant());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.activeSession).toMatchObject({ id: 'conv-1', title: 'Existing chat' });
    expect(result.current.activeSession?.messages.map(m => m.content)).toEqual(['Prior answer']);
    expect(result.current.activeSession?.messages[0]!.timestamp).toEqual(new Date(CREATED_AT));
    expect(result.current.uploadedFiles).toMatchObject([
      { id: 'rag-9', name: 'report.pdf', status: 'ready' },
    ]);
    expect(result.current.lifestyle).toEqual({
      household: { members: [] },
      routines: [],
      routineContext: 'Saved context',
    });
    expect(localStorageMock.getItem).toHaveBeenCalledWith(`${PREFIX}${UID}_conversations`);
    expect(readStored<{ id: string }[]>('conversations')).toHaveLength(1);
  });
});

describe('useAssistant messaging', () => {
  it('sends a message with snapshotted history, attachment id and saved lifestyle context', async () => {
    seedChatFixture();
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.attachFile(result.current.uploadedFiles[0]!));
    expect(result.current.pendingAttachment?.ragFileId).toBe('rag-9');

    await act(async () => {
      await result.current.handleSendMessage('Tell me more');
    });

    expectChatRequest();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.pendingAttachment).toBeNull();
    expect(result.current.inputMessage).toBe('');
    expect(result.current.activeSession?.messages.map(m => m.content)).toEqual([
      'Prior answer',
      'Tell me more',
      'Mock assistant answer',
    ]);
    expect(
      readStored<{ role: string; content: string }[]>('messages_conv-1').map(m => m.content),
    ).toEqual(['Prior answer', 'Tell me more', 'Mock assistant answer']);
  });
});

describe('useAssistant local sessions', () => {
  it('keeps chatting in a local-only session when Firestore refuses to create one', async () => {
    firebaseState.isFirebaseConfigured = true;
    firebaseState.db = { fake: 'db' };
    firestore.addDoc.mockRejectedValue(new Error('permission denied'));
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      if (key.endsWith('_conversations')) throw new Error('storage denied');
      store.set(key, value);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await result.current.handleSendMessage('Still works');
    });

    expect(firestore.addDoc).toHaveBeenCalled();
    expect(result.current.currentSessionId).toMatch(/^local-/);
    expect(result.current.activeSession?.messages.map(m => m.content)).toEqual([
      'Still works',
      'Mock assistant answer',
    ]);
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
      `${PREFIX}${UID}_messages_${result.current.currentSessionId}`,
      expect.anything(),
    );
    expect(warn).toHaveBeenCalled();
  });
});

describe('useAssistant uploads', () => {
  it('uploads, stages, and deletes a document with RAG and local persistence', async () => {
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const file = new File(['report bytes'], 'report.pdf', { type: 'application/pdf' });

    let uploaded: { id: string; status: string; ragFileId?: string }[] = [];
    await act(async () => {
      uploaded = await result.current.uploadFiles([file]);
    });

    expect(uploaded[0]).toMatchObject({ name: 'report.pdf', status: 'ready', ragFileId: 'rag-1' });
    expect(result.current.uploadProgress[uploaded[0]!.id]).toBe(100);
    expect(readStored<{ ragFileId: string }[]>('uploads')[0]!.ragFileId).toBe('rag-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test.local/api/rag/upload',
      expect.objectContaining({ method: 'POST' }),
    );

    act(() => result.current.attachFile(result.current.uploadedFiles[0]!));
    expect(result.current.pendingAttachment?.name).toBe('report.pdf');

    await act(async () => {
      await result.current.handleDeleteFile(result.current.uploadedFiles[0]!);
    });

    expect(result.current.pendingAttachment).toBeNull();
    expect(result.current.uploadedFiles).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://test.local/api/rag/files/rag-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(readStored<unknown[]>('uploads')).toEqual([]);
  });
});

describe('useAssistant upload errors', () => {
  it('rejects unsupported uploads and surfaces the session-specific send error', async () => {
    const { result } = renderHook(() => useAssistant());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.uploadFiles([new File(['bad'], 'malware.exe')]);
    });

    expect(result.current.attachmentError).toBe(
      'Unsupported file type: malware.exe. Upload PDF, CSV, or TXT.',
    );
    expect(result.current.uploadedFiles).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/rag/upload'))).toBe(
      false,
    );

    network.chatStatus = 401;
    await act(async () => {
      await result.current.handleSendMessage('Hello');
    });

    expect(result.current.activeSession?.messages[1]!.content).toContain('Unauthorized');
    expect(result.current.activeSession?.messages[1]!.content).toContain(
      'Your session is no longer valid. Sign in again and retry.',
    );
    expect(result.current.isLoading).toBe(false);
  });
});
