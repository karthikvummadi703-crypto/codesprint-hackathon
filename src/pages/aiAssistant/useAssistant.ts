/**
 * Assistant page state: conversations, streaming replies, uploads, prompt
 * suggestions, and abortable chat requests.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import {
  listConversations,
  createConversation,
  deleteConversation,
  listMessages,
  listUploads,
  deleteUpload,
  getLifestyleSettings,
} from '../../services/dataService';
import { deleteRagFile } from '../../services/backendService';
import { deleteFromStorage } from '../../services/storageService';
import { ChatSession, KnowledgeFile } from '../../types';
import { isLocalConvo, newLocalConvoId } from './constants';
import { LifestyleContext } from './types';
import { toChatMessage, toKnowledgeFile } from './utils';
import { uploadFilesForUser } from './upload';
import { createSendMessage } from './sendMessage';

export function useAssistant() {
  const { user } = useAuth();
  const { location } = useLocation();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<KnowledgeFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  // Documents chosen for the next message. Kept separate from `uploadedFiles`
  // because the choice is per-message: the file is referenced by id in the chat
  // request, not silently added to the whole knowledge base.
  const [pendingAttachment, setPendingAttachment] = useState<KnowledgeFile | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [dragActive, setDragActive] = useState(false);
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
  }, [user]);

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

  const handleSendMessage = createSendMessage({
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
  });

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== id);
    setSessions(filtered);
    if (currentSessionId === id) {
      setCurrentSessionId(filtered.length > 0 ? filtered[0]!.id : '');
    }
    if (user && !isLocalConvo(id)) await deleteConversation(user.uid, id).catch(() => {});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    e.target.value = '';
    await uploadFiles(Array.from(files));
  };

  const uploadFiles = async (incoming: File[]): Promise<KnowledgeFile[]> => {
    if (!user) return [];
    return uploadFilesForUser(incoming, user, {
      setUploadedFiles,
      setUploadProgress,
      setAttachmentError,
    });
  };

  const handleDeleteFile = async (file: KnowledgeFile) => {
    if (!user) return;
    setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
    // Drop it from the composer too, otherwise the next message would
    // reference a document that no longer exists.
    setPendingAttachment((prev) => (prev?.id === file.id ? null : prev));
    if (file.ragFileId) {
      await deleteRagFile(file.ragFileId).catch(() => {});
    }
    if (file.name) {
      await deleteFromStorage(`users/${user.uid}/uploads/${file.name}`).catch(() => {});
    }
    await deleteUpload(user.uid, file.id).catch(() => {});
  };

  /** Attach an already-indexed document to the next message. */
  const attachFile = (file: KnowledgeFile) => {
    if (file.status !== 'ready') {
      setAttachmentError('That document is still being indexed.');
      return;
    }
    setPendingAttachment(file);
    setAttachmentError('');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    const uploaded = await uploadFiles(dropped);
    // A single dropped file is also staged for the current message, which is
    // what makes drag-and-drop usable for "what does this report say?".
    const first = uploaded.find((f) => f.status === 'ready');
    if (first) setPendingAttachment(first);
  };

  const filteredSessions = sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return {
    sessions,
    currentSessionId,
    searchQuery,
    inputMessage,
    isLoading,
    showUploadPanel,
    loaded,
    uploadedFiles,
    uploadProgress,
    pendingAttachment,
    attachmentError,
    dragActive,
    activeSession,
    filteredSessions,
    fileInputRef,
    attachInputRef,
    messagesEndRef,
    setCurrentSessionId,
    setSearchQuery,
    setInputMessage,
    setShowUploadPanel,
    setDragActive,
    setPendingAttachment,
    setAttachmentError,
    handleNewChat,
    handleSendMessage,
    handleDeleteSession,
    handleFileUpload,
    handleDeleteFile,
    attachFile,
    handleDrop,
  };
}
