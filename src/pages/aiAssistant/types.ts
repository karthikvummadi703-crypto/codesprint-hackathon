import { KnowledgeFile } from '../../types';

export interface LifestyleContext {
  household?: Record<string, unknown>;
  routines?: Record<string, unknown>[];
  routineContext?: string;
}

export interface AssistantReplyParams {
  uid: string;
  text: string;
  attachment: KnowledgeFile | null;
  history: { role: 'user' | 'assistant'; content: string }[];
  location: {
    name: string;
    latitude?: number;
    longitude?: number;
    region?: string;
    country?: string;
  } | null;
  lifestyle: LifestyleContext | null;
}
