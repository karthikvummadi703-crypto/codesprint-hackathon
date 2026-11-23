import {
  getLifestyleSettings,
  listConversations,
  listMessages,
  listUploads,
} from '../../../services/dataService';
import type { ChatSession } from '../../../types';
import type { ConversationRecord, UploadRecord } from '../../../services/dataServiceShared';
import { toChatMessage } from './chat';

export interface LifestyleSnapshot {
  household?: Record<string, unknown>;
  routines?: Record<string, unknown>[];
  routineContext?: string;
}

export interface AssistantData {
  convos: ConversationRecord[];
  uploads: UploadRecord[];
  lifestyle: LifestyleSnapshot;
}

export async function loadAssistantData(uid: string): Promise<AssistantData> {
  const [convos, uploads, lifestyleData] = await Promise.all([
    listConversations(uid),
    listUploads(uid),
    getLifestyleSettings(uid).catch(() => null),
  ]);
  return {
    convos,
    uploads,
    lifestyle: {
      household: lifestyleData?.household as Record<string, unknown> | undefined,
      routines: lifestyleData?.routines as Record<string, unknown>[] | undefined,
      routineContext:
        typeof lifestyleData?.routinePromptContext === 'string'
          ? lifestyleData.routinePromptContext
          : undefined,
    },
  };
}

export async function hydrateConversations(
  uid: string,
  convos: ConversationRecord[],
): Promise<ChatSession[]> {
  return Promise.all(
    convos.map(async c => {
      const msgs = await listMessages(uid, c.id).catch(() => []);
      return {
        id: c.id,
        title: c.title,
        messages: msgs.map(toChatMessage),
        updatedAt: new Date(c.updatedAt),
        createdAt: new Date(c.createdAt),
      };
    }),
  );
}
