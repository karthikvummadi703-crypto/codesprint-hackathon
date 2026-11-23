import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import type { ChatMessage, ChatSession } from '../../../types';
import { LifestyleSnapshot } from '../modules/data';
import { UploadController } from './useAssistantUploads';
import {
  buildSessionController,
  useActiveSession,
  useAppendMessage,
  useAppendUserMessage,
  useDeleteSessionHandler,
  useEnsureSession,
  useFilteredSessions,
  useNewChatHandler,
  useReloadData,
  useReloadEffect,
  useSessionState,
} from './useSessionActions';

export interface SessionController {
  sessions: ChatSession[];
  currentSessionId: string;
  activeSession: ChatSession | undefined;
  filteredSessions: ChatSession[];
  searchQuery: string;
  loaded: boolean;
  lifestyle: LifestyleSnapshot | null;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string>>;
  ensureSession: (uid: string, existingId: string) => Promise<string>;
  appendMessage: (convoId: string, message: ChatMessage, touchUpdatedAt: boolean) => void;
  appendUserMessage: (convoId: string, message: ChatMessage, title: string) => void;
  handleNewChat: () => Promise<void>;
  handleDeleteSession: (id: string, event: React.MouseEvent) => Promise<void>;
}

export function useAssistantSessions(
  user: ReturnType<typeof useAuth>['user'],
  uploads: UploadController,
): SessionController {
  const state = useSessionState();
  const activeSession = useActiveSession(state.sessions, state.currentSessionId);
  const filteredSessions = useFilteredSessions(state.sessions, state.searchQuery);
  const reloadData = useReloadData(
    user,
    uploads.setUploadedFiles,
    state.setSessions,
    state.setCurrentSessionId,
    state.setLifestyle,
    state.setLoaded,
  );
  const ensureSession = useEnsureSession(
    state.sessions,
    state.setSessions,
    state.setCurrentSessionId,
    state.setLoaded,
  );
  const appendMessage = useAppendMessage(state.setSessions);
  const appendUserMessage = useAppendUserMessage(state.setSessions);
  const handleNewChat = useNewChatHandler(user, ensureSession, state.setCurrentSessionId);
  const handleDeleteSession = useDeleteSessionHandler(
    state.sessions,
    state.currentSessionId,
    user,
    state.setSessions,
    state.setCurrentSessionId,
  );
  useReloadEffect(reloadData);

  return buildSessionController({
    state,
    activeSession,
    filteredSessions,
    ensureSession,
    appendMessage,
    appendUserMessage,
    handleNewChat,
    handleDeleteSession,
  });
}
