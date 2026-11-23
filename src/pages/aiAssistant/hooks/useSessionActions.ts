import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { createConversation, deleteConversation } from '../../../services/dataService';
import type { ChatMessage, ChatSession, KnowledgeFile } from '../../../types';
import { isLocalConvo, newLocalConvoId } from '../modules/chat';
import { LifestyleSnapshot } from '../modules/data';
import { loadSessionSnapshot } from '../modules/sessionLoad';

type User = ReturnType<typeof useAuth>['user'];
type SessionSetter = React.Dispatch<React.SetStateAction<ChatSession[]>>;
type CurrentIdSetter = React.Dispatch<React.SetStateAction<string>>;

export function useSessionState() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [lifestyle, setLifestyle] = useState<LifestyleSnapshot | null>(null);
  return {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    searchQuery,
    setSearchQuery,
    loaded,
    setLoaded,
    lifestyle,
    setLifestyle,
  };
}

export interface SessionControllerParts {
  state: ReturnType<typeof useSessionState>;
  activeSession: ChatSession | undefined;
  filteredSessions: ChatSession[];
  ensureSession: (uid: string, existingId: string) => Promise<string>;
  appendMessage: (convoId: string, message: ChatMessage, touchUpdatedAt: boolean) => void;
  appendUserMessage: (convoId: string, message: ChatMessage, title: string) => void;
  handleNewChat: () => Promise<void>;
  handleDeleteSession: (id: string, event: React.MouseEvent) => Promise<void>;
}

export function buildSessionController(parts: SessionControllerParts) {
  const { state, activeSession, filteredSessions } = parts;
  return {
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    activeSession,
    filteredSessions,
    searchQuery: state.searchQuery,
    loaded: state.loaded,
    lifestyle: state.lifestyle,
    setSearchQuery: state.setSearchQuery,
    setCurrentSessionId: state.setCurrentSessionId,
    ensureSession: parts.ensureSession,
    appendMessage: parts.appendMessage,
    appendUserMessage: parts.appendUserMessage,
    handleNewChat: parts.handleNewChat,
    handleDeleteSession: parts.handleDeleteSession,
  };
}

export function useActiveSession(sessions: ChatSession[], currentSessionId: string) {
  return sessions.find(s => s.id === currentSessionId) || sessions[0];
}

export function useFilteredSessions(sessions: ChatSession[], searchQuery: string) {
  return useMemo(
    () => sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase())),
    [sessions, searchQuery],
  );
}

export function useReloadEffect(reloadData: () => Promise<void>) {
  useEffect(() => {
    reloadData();
  }, [reloadData]);
}

export function useReloadData(
  user: User,
  setUploadedFiles: (files: KnowledgeFile[]) => void,
  setSessions: SessionSetter,
  setCurrentSessionId: CurrentIdSetter,
  setLifestyle: React.Dispatch<React.SetStateAction<LifestyleSnapshot | null>>,
  setLoaded: React.Dispatch<React.SetStateAction<boolean>>,
) {
  return useCallback(async () => {
    if (!user) return;
    try {
      const { hydrated, lifestyle } = await loadSessionSnapshot(user.uid, setUploadedFiles);
      setSessions(hydrated);
      setLifestyle(lifestyle);
      if (hydrated.length > 0) {
        setCurrentSessionId(prev => prev || hydrated[0]!.id);
      } else {
        const newId = await createConversation(user.uid, 'New Conversation');
        setSessions([
          {
            id: newId,
            title: 'New Conversation',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        setCurrentSessionId(newId);
      }
      setLoaded(true);
    } catch (e) {
      console.error('Failed to load conversations', e);
      setLoaded(true);
    }
  }, [user, setUploadedFiles, setSessions, setCurrentSessionId, setLifestyle, setLoaded]);
}

export function useEnsureSession(
  sessions: ChatSession[],
  setSessions: SessionSetter,
  setCurrentSessionId: CurrentIdSetter,
  setLoaded: React.Dispatch<React.SetStateAction<boolean>>,
) {
  return useCallback(
    async (uid: string, existingId: string): Promise<string> => {
      if (existingId && sessions.some(s => s.id === existingId)) return existingId;
      const newId = await createConversation(uid, 'New Conversation').catch(e => {
        console.warn('Conversation could not be persisted, using a local one', e);
        return newLocalConvoId();
      });
      const fresh: ChatSession = {
        id: newId,
        title: 'New Conversation',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSessions(prev => (prev.some(s => s.id === newId) ? prev : [fresh, ...prev]));
      setCurrentSessionId(newId);
      setLoaded(true);
      return newId;
    },
    [sessions, setSessions, setCurrentSessionId, setLoaded],
  );
}

export function useAppendMessage(setSessions: SessionSetter) {
  return useCallback(
    (convoId: string, message: ChatMessage, touchUpdatedAt: boolean) => {
      setSessions(prev =>
        prev.map(s =>
          s.id === convoId
            ? {
                ...s,
                messages: [...s.messages, message],
                ...(touchUpdatedAt ? { updatedAt: new Date() } : {}),
              }
            : s,
        ),
      );
    },
    [setSessions],
  );
}

export function useAppendUserMessage(setSessions: SessionSetter) {
  return useCallback(
    (convoId: string, message: ChatMessage, title: string) => {
      setSessions(prev =>
        prev.map(s =>
          s.id === convoId
            ? {
                ...s,
                title: s.title === 'New Conversation' ? title : s.title,
                messages: [...s.messages, message],
                updatedAt: new Date(),
              }
            : s,
        ),
      );
    },
    [setSessions],
  );
}

export function useNewChatHandler(
  user: User,
  ensureSession: (uid: string, existingId: string) => Promise<string>,
  setCurrentSessionId: CurrentIdSetter,
) {
  return useCallback(async () => {
    if (!user) return;
    setCurrentSessionId(await ensureSession(user.uid, ''));
  }, [user, ensureSession, setCurrentSessionId]);
}

export function useDeleteSessionHandler(
  sessions: ChatSession[],
  currentSessionId: string,
  user: User,
  setSessions: SessionSetter,
  setCurrentSessionId: CurrentIdSetter,
) {
  return useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const filtered = sessions.filter(s => s.id !== id);
      setSessions(filtered);
      if (currentSessionId === id) {
        setCurrentSessionId(filtered.length > 0 ? filtered[0]!.id : '');
      }
      if (user && !isLocalConvo(id)) await deleteConversation(user.uid, id).catch(() => {});
    },
    [sessions, currentSessionId, user, setSessions, setCurrentSessionId],
  );
}
