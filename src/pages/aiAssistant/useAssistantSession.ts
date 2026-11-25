/** Conversation and session state for the AI assistant page. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

import {
  createConversation,
  deleteConversation,
  getLifestyleSettings,
  listConversations,
  listMessages,
  listUploads,
} from '../../services/dataService';
import type { AppUser } from '../../services/authService';
import type { ChatSession, KnowledgeFile } from '../../types';
import { isLocalConvo, newLocalConvoId } from './constants';
import type { LifestyleContext } from './types';
import { toChatMessage, toKnowledgeFile } from './utils';

interface SessionOptions {
  user: AppUser | null;
  isLoading: boolean;
  setUploadedFiles: React.Dispatch<React.SetStateAction<KnowledgeFile[]>>;
}

export function useAssistantSession({ user, isLoading, setUploadedFiles }: SessionOptions) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [lifestyle, setLifestyle] = useState<LifestyleContext | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === currentSessionId) || sessions[0]!;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isLoading]);

  const reloadData = useCallback(async () => {
    if (!user) return;
    try {
      const [convos, uploads, lifestyleData] = await Promise.all([
        listConversations(user.uid),
        listUploads(user.uid),
        getLifestyleSettings(user.uid).catch(() => null),
      ]);
      const hydrated: ChatSession[] = await Promise.all(
        convos.map(async (c) => {
          const msgs = await listMessages(user.uid, c.id).catch(() => []);
          return {
            id: c.id,
            title: c.title,
            messages: msgs.map(toChatMessage),
            updatedAt: new Date(c.updatedAt),
            createdAt: new Date(c.createdAt),
          };
        }),
      );
      setSessions(hydrated);
      setUploadedFiles(uploads.map(toKnowledgeFile));
      setLifestyle({
        household: lifestyleData?.household as Record<string, unknown> | undefined,
        routines: lifestyleData?.routines as Record<string, unknown>[] | undefined,
        routineContext:
          typeof lifestyleData?.routinePromptContext === 'string'
            ? lifestyleData.routinePromptContext
            : undefined,
      });
      if (hydrated.length > 0) {
        setCurrentSessionId((prev) => prev || hydrated[0]!.id);
      } else {
        const newId = await createConversation(user.uid, 'New Conversation');
        const newSession: ChatSession = {
          id: newId,
          title: 'New Conversation',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setSessions([newSession]);
        setCurrentSessionId(newId);
      }
      setLoaded(true);
    } catch (e) {
      console.error('Failed to load conversations', e);
      // Still mark loaded: a failed load must not leave the sidebar stuck on
      // "Loading conversations." forever, and the composer is usable because a
      // session is now created on demand when the first message is sent.
      setLoaded(true);
    }
  }, [user, setUploadedFiles]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  /**
   * Make sure a usable session exists and return its id. Never rejects: a
   * Firestore failure downgrades to an in-memory conversation so the composer
   * keeps working instead of discarding what the user typed.
   */
  const ensureSession = useCallback(
    async (uid: string, existingId: string): Promise<string> => {
      if (existingId && sessions.some((s) => s.id === existingId)) return existingId;
      const newId = await createConversation(uid, 'New Conversation').catch((e) => {
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
      setSessions((prev) => (prev.some((s) => s.id === newId) ? prev : [fresh, ...prev]));
      setCurrentSessionId(newId);
      setLoaded(true);
      return newId;
    },
    [sessions],
  );

  const handleNewChat = async () => {
    if (!user) return;
    const newId = await ensureSession(user.uid, '');
    setCurrentSessionId(newId);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== id);
    setSessions(filtered);
    if (currentSessionId === id) {
      setCurrentSessionId(filtered.length > 0 ? filtered[0]!.id : '');
    }
    if (user && !isLocalConvo(id)) await deleteConversation(user.uid, id).catch(() => {});
  };

  const filteredSessions = sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    searchQuery,
    setSearchQuery,
    loaded,
    lifestyle,
    activeSession,
    filteredSessions,
    fileInputRef,
    attachInputRef,
    messagesEndRef,
    ensureSession,
    handleNewChat,
    handleDeleteSession,
  };
}
