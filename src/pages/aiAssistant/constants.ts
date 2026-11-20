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

/**
 * Marker for conversations that Firestore refused to create (offline, rules not
 * deployed, write denied). The chat still works: the session lives in React
 * state, so the user can talk to the assistant, but every persistence call for
 * it is skipped because Firestore would reject the unknown id anyway.
 */
export const LOCAL_CONVO_PREFIX = 'local-';

export function isLocalConvo(id: string): boolean {
  return id.startsWith(LOCAL_CONVO_PREFIX);
}

export function newLocalConvoId(): string {
  return `${LOCAL_CONVO_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
