import React from 'react';
import { ActiveLocation } from '../../context/LocationContext';
import { AppUser } from '../../services/authService';
import { addMessage, updateConversation } from '../../services/dataService';
import { ChatMessage, ChatSession, KnowledgeFile } from '../../types';
import { isLocalConvo } from './constants';
import { requestAssistantReply } from './requestAssistant';
import { LifestyleContext } from './types';

export interface SendMessageContext {
  user: AppUser | null;
  location: ActiveLocation | null;
  sessions: ChatSession[];
  currentSessionId: string;
  pendingAttachment: KnowledgeFile | null;
  lifestyle: LifestyleContext | null;
  isLoading: boolean;
  ensureSession: (uid: string, existingId: string) => Promise<string>;
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  setPendingAttachment: React.Dispatch<React.SetStateAction<KnowledgeFile | null>>;
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export function createSendMessage({
  user,
  location,
  sessions,
  currentSessionId,
  pendingAttachment,
  lifestyle,
  isLoading,
  ensureSession,
  setSessions,
  setInputMessage,
  setPendingAttachment,
  setAttachmentError,
  setIsLoading,
}: SendMessageContext) {
  return async (text: string): Promise<void> => {
    if (!text.trim() || isLoading) return;
    if (!user) {
      setAttachmentError('Sign in to use the assistant.');
      return;
    }

    // An attachment that has not finished indexing cannot be retrieved from, so
    // it is refused here rather than sent and silently ignored by the model.
    // Checked before the session is created so a rejected turn does not leave
    // behind an empty conversation in the sidebar.
    if (pendingAttachment && pendingAttachment.status !== 'ready') {
      setAttachmentError('Wait for the document to finish uploading before asking about it.');
      return;
    }

    // The session is created on demand rather than required. Returning early
    // when none was ready made the composer silently swallow the question: the
    // initial load can fail (Firestore rules, offline, signed out) and then every
    // send was dropped with no message shown at all. A failed persist now
    // downgrades to a local session instead of dropping the turn.
    const convoId = await ensureSession(user.uid, currentSessionId);
    const persisted = !isLocalConvo(convoId);

    const attachment = pendingAttachment;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const priorMessages = sessions.find((s) => s.id === convoId)?.messages ?? [];

    // History is snapshotted before this turn is appended, then the current
    // question is added on top. Reading the live session state here would send
    // the model a history that is missing the turn it is being asked to answer.
    const history = [...priorMessages, userMsg].slice(-10).map((m) => ({ role: m.role, content: m.content }));

    // Persisting is best-effort. A rejected write used to escape the handler and
    // abort the send before anything was rendered, which looked exactly like the
    // input not working.
    if (persisted) {
      void addMessage(user.uid, convoId, { role: 'user', content: text }).catch((e) =>
        console.warn('Message not saved to history', e),
      );
    }

    const currentTitle =
      sessions.find((s) => s.id === convoId)?.title === 'New Conversation'
        ? text.slice(0, 30) + (text.length > 30 ? '...' : '')
        : sessions.find((s) => s.id === convoId)?.title || 'New Conversation';
    if (sessions.find((s) => s.id === convoId)?.title === 'New Conversation' && persisted) {
      void updateConversation(user.uid, convoId, currentTitle).catch(() => {});
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === convoId
          ? {
              ...s,
              title: s.title === 'New Conversation' ? currentTitle : s.title,
              messages: [...s.messages, userMsg],
              updatedAt: new Date(),
            }
          : s,
      ),
    );
    setInputMessage('');
    // The attachment applies to one message only; keeping it would silently
    // re-attach the same document to every later question in the chat.
    setPendingAttachment(null);
    setAttachmentError('');
    setIsLoading(true);

    try {
      const response = await requestAssistantReply({
        uid: user.uid,
        text,
        attachment,
        history,
        location,
        lifestyle,
      });
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      if (persisted) {
        void addMessage(user.uid, convoId, { role: 'assistant', content: response }).catch(() => {});
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.id === convoId ? { ...s, messages: [...s.messages, aiMsg], updatedAt: new Date() } : s,
        ),
      );
    } catch (e) {
      // Name the real cause. A blanket "start the backend" hint sent people
      // chasing a server that was already running when the failure was a 401.
      const msg = e instanceof Error ? e.message : String(e);
      const hint = /401|Unauthorized|unauthorized/.test(msg)
        ? 'Your session is no longer valid. Sign in again and retry.'
        : /Failed to fetch|NetworkError|Load failed/i.test(msg)
          ? 'Could not reach the backend. Start it with `uvicorn main:app --reload --port 8001` and check that VITE_API_BASE_URL matches.'
          : 'The AI service rejected the request. Check the backend logs for details.';
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ I couldn't answer that. ${msg}\n\n${hint}`,
        timestamp: new Date(),
      };
      setSessions((prev) =>
        prev.map((s) => (s.id === convoId ? { ...s, messages: [...s.messages, aiMsg] } : s)),
      );
    } finally {
      setIsLoading(false);
    }
  };
}
