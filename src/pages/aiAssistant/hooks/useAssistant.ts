import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useLocation } from '../../../context/LocationContext';
import { MessagingController, useAssistantMessaging } from './useAssistantMessaging';
import { SessionController, useAssistantSessions } from './useAssistantSessions';
import { UploadController, useAssistantUploads } from './useAssistantUploads';

export interface AssistantController
  extends UploadController, SessionController, MessagingController {
  showUploadPanel: boolean;
  setShowUploadPanel: React.Dispatch<React.SetStateAction<boolean>>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

/** Composes upload, session, and messaging state and scrolls to the latest message. */
export function useAssistant(): AssistantController {
  const { user } = useAuth();
  const { location } = useLocation();
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const uploads = useAssistantUploads(user);
  const sessions = useAssistantSessions(user, uploads);
  const messaging = useAssistantMessaging(user, location, sessions, uploads);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions.activeSession?.messages, messaging.isLoading]);

  return {
    ...uploads,
    ...sessions,
    ...messaging,
    showUploadPanel,
    setShowUploadPanel,
    messagesEndRef,
  };
}
