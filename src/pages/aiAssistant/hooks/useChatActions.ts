import { useCallback } from 'react';
import type { ActiveLocation } from '../../../context/LocationContext';
import { sendChatMessage } from '../../../services/backendService';
import { addMessage, updateConversation } from '../../../services/dataService';
import type { ChatMessage, KnowledgeFile } from '../../../types';
import {
  buildHistory,
  ChatHistoryEntry,
  deriveTitle,
  describeChatError,
  isLocalConvo,
} from '../modules/chat';
import { gatherChatContext } from '../modules/context';
import { LifestyleSnapshot } from '../modules/data';
import { SessionController } from './useAssistantSessions';
import { UploadController } from './useAssistantUploads';

type LoadingSetter = (loading: boolean) => void;

function createAiMessage(content: string): ChatMessage {
  return {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content,
    timestamp: new Date(),
  };
}

function persistAssistantReply(uid: string, convoId: string, content: string) {
  void addMessage(uid, convoId, { role: 'assistant', content }).catch(() => {});
}

export function useSendChatTurn(
  location: ActiveLocation | null,
  lifestyle: LifestyleSnapshot | null,
  appendMessage: SessionController['appendMessage'],
  setIsLoading: LoadingSetter,
) {
  return useCallback(
    async (
      uid: string,
      text: string,
      convoId: string,
      persisted: boolean,
      attachment: KnowledgeFile | null,
      history: ChatHistoryEntry[],
    ) => {
      setIsLoading(true);
      try {
        const context = await gatherChatContext(uid, location);
        const { response } = await sendChatMessage(text, {
          location: context.pinnedLocation,
          aqHistory: context.aqHistory,
          carbonTrips: context.carbonTrips,
          predictions: context.predictions,
          documentIds: attachment?.ragFileId ? [attachment.ragFileId] : undefined,
          history,
          household: lifestyle?.household,
          routines: lifestyle?.routines,
          routineContext: lifestyle?.routineContext,
        });
        if (persisted) persistAssistantReply(uid, convoId, response);
        appendMessage(convoId, createAiMessage(response), true);
      } catch (e) {
        appendMessage(convoId, createAiMessage(describeChatError(e)), false);
      } finally {
        setIsLoading(false);
      }
    },
    [location, lifestyle, appendMessage, setIsLoading],
  );
}

export function useSendMessageHandler(
  user: ReturnType<typeof import('../../../context/AuthContext').useAuth>['user'],
  sessions: SessionController,
  uploads: UploadController,
  sendChatTurn: ReturnType<typeof useSendChatTurn>,
  isLoading: boolean,
  setInputMessage: (value: string) => void,
) {
  return useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;
      if (!user) {
        uploads.setAttachmentError('Sign in to use the assistant.');
        return;
      }
      if (uploads.pendingAttachment && uploads.pendingAttachment.status !== 'ready') {
        uploads.setAttachmentError(
          'Wait for the document to finish uploading before asking about it.',
        );
        return;
      }
      const convoId = await sessions.ensureSession(user.uid, sessions.currentSessionId);
      const persisted = !isLocalConvo(convoId);
      const attachment = uploads.pendingAttachment;
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      const prior = sessions.sessions.find(s => s.id === convoId)?.messages ?? [];
      const history = buildHistory(prior, userMsg);
      if (persisted) {
        void addMessage(user.uid, convoId, { role: 'user', content: text }).catch(e =>
          console.warn('Message not saved to history', e),
        );
      }
      const current = sessions.sessions.find(s => s.id === convoId);
      const title = deriveTitle(current?.title, text);
      if (current?.title === 'New Conversation' && persisted) {
        void updateConversation(user.uid, convoId, title).catch(() => {});
      }
      sessions.appendUserMessage(convoId, userMsg, title);
      setInputMessage('');
      uploads.clearAttachment();
      await sendChatTurn(user.uid, text, convoId, persisted, attachment, history);
    },
    [isLoading, user, sessions, uploads, sendChatTurn, setInputMessage],
  );
}
