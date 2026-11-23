import type { ChatMessage } from '../../../types';
import type { MessageRecord } from '../../../services/dataServiceShared';

export const SUGGESTED_PROMPTS = [
  'Summarize my environmental data',
  'Why is my AQI increasing?',
  'Analyze my uploaded report',
  'Compare my pollution history',
  'How can I reduce my carbon footprint?',
  'What should my household do during winter smog?',
  'How can I improve indoor air quality at home?',
  'What are the health effects of PM2.5?',
];

const LOCAL_CONVO_PREFIX = 'local-';

export function isLocalConvo(id: string): boolean {
  return id.startsWith(LOCAL_CONVO_PREFIX);
}

export function newLocalConvoId(): string {
  return `${LOCAL_CONVO_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function toChatMessage(raw: MessageRecord): ChatMessage {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    timestamp: new Date(raw.timestamp),
  };
}

export interface ChatHistoryEntry {
  role: ChatMessage['role'];
  content: string;
}

export function buildHistory(messages: ChatMessage[], userMsg: ChatMessage): ChatHistoryEntry[] {
  return [...messages, userMsg].slice(-10).map(m => ({ role: m.role, content: m.content }));
}

export function deriveTitle(title: string | undefined, text: string): string {
  if (title === 'New Conversation') {
    return text.slice(0, 30) + (text.length > 30 ? '...' : '');
  }
  return title || 'New Conversation';
}

export function describeChatError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const hint = /401|Unauthorized|unauthorized/.test(msg)
    ? 'Your session is no longer valid. Sign in again and retry.'
    : /Failed to fetch|NetworkError|Load failed/i.test(msg)
      ? 'Could not reach the backend. Start it with `uvicorn main:app --reload --port 8001` and check that VITE_API_BASE_URL matches.'
      : 'The AI service rejected the request. Check the backend logs for details.';
  return `⚠️ I couldn't answer that. ${msg}\n\n${hint}`;
}
