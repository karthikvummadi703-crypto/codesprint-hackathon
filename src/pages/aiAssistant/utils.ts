import { ChatMessage, KnowledgeFile } from '../../types';

export function toChatMessage(raw: any): ChatMessage {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    timestamp: new Date(raw.timestamp),
  };
}

export function toKnowledgeFile(raw: any): KnowledgeFile {
  return {
    id: raw.fileId || raw.id,
    name: raw.name,
    type: raw.type,
    size: Number(raw.size || 0),
    uploadedAt: new Date(raw.uploadedAt),
    status: raw.status || 'ready',
    ragFileId: raw.ragFileId || undefined,
  };
}
