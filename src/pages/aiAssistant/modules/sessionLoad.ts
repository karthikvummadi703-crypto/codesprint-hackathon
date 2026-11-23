import type { KnowledgeFile } from '../../../types';
import { hydrateConversations, loadAssistantData, LifestyleSnapshot } from './data';
import { toKnowledgeFile } from './uploads';

export interface SessionSnapshot {
  hydrated: Awaited<ReturnType<typeof hydrateConversations>>;
  lifestyle: LifestyleSnapshot | null;
}

export async function loadSessionSnapshot(
  uid: string,
  setUploadedFiles: (files: KnowledgeFile[]) => void,
): Promise<SessionSnapshot> {
  const { convos, uploads, lifestyle } = await loadAssistantData(uid);
  const hydrated = await hydrateConversations(uid, convos);
  setUploadedFiles(uploads.map(toKnowledgeFile));
  return { hydrated, lifestyle };
}
