import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import type { ActiveLocation } from '../../../context/LocationContext';
import { useSendChatTurn, useSendMessageHandler } from './useChatActions';
import { SessionController } from './useAssistantSessions';
import { UploadController } from './useAssistantUploads';

export interface MessagingController {
  inputMessage: string;
  isLoading: boolean;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  handleSendMessage: (text: string) => Promise<void>;
}

export function useAssistantMessaging(
  user: ReturnType<typeof useAuth>['user'],
  location: ActiveLocation | null,
  sessions: SessionController,
  uploads: UploadController,
): MessagingController {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendChatTurn = useSendChatTurn(
    location,
    sessions.lifestyle,
    sessions.appendMessage,
    setIsLoading,
  );
  const handleSendMessage = useSendMessageHandler(
    user,
    sessions,
    uploads,
    sendChatTurn,
    isLoading,
    setInputMessage,
  );

  return { inputMessage, isLoading, setInputMessage, handleSendMessage };
}
