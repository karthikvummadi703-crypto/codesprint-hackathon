/** Chat conversation and message persistence. */
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';

import type { ChatMessage, ConversationRecord, MessageRecord } from '../../types';
import { db, isFirebaseConfigured } from '../firebase';
import { DEV_PREFIX, devRead, devWrite, isoNow } from './devStore';

export async function listConversations(uid: string): Promise<ConversationRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ConversationRecord);
    } catch (err) {
      console.warn('Firestore listConversations failed, falling back to local storage:', err);
    }
  }
  const items = devRead<ConversationRecord>(uid, 'conversations');
  return items.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
}

export async function createConversation(uid: string, title: string): Promise<string> {
  const now = isoNow();
  const data = { title, updatedAt: now, createdAt: now };
  if (isFirebaseConfigured && db) {
    try {
      const ref = await addDoc(collection(db, 'users', uid, 'conversations'), data);
      return ref.id;
    } catch (err) {
      console.warn('Firestore createConversation failed, falling back to local storage:', err);
    }
  }
  const items = devRead<ConversationRecord>(uid, 'conversations');
  const id = `conv-${Date.now()}`;
  items.push({ id, ...data });
  devWrite(uid, 'conversations', items);
  return id;
}

export async function updateConversation(
  uid: string,
  convId: string,
  title: string,
  updatedAt?: string,
): Promise<void> {
  const now = updatedAt || isoNow();
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'users', uid, 'conversations', convId), { title, updatedAt: now });
      return;
    } catch (err) {
      console.warn('Firestore updateConversation failed, falling back to local storage:', err);
    }
  }
  const items = devRead<ConversationRecord>(uid, 'conversations').map((c) =>
    c.id === convId ? { ...c, title, updatedAt: now } : c,
  );
  devWrite(uid, 'conversations', items);
}

export async function deleteConversation(uid: string, convId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'conversations', convId));
      return;
    } catch (err) {
      console.warn('Firestore deleteConversation failed, falling back to local storage:', err);
    }
  }
  devWrite(
    uid,
    'conversations',
    devRead<ConversationRecord>(uid, 'conversations').filter((c) => c.id !== convId),
  );
  localStorage.removeItem(`${DEV_PREFIX}${uid}_messages_${convId}`);
}

export async function listMessages(uid: string, convId: string): Promise<MessageRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'users', uid, 'conversations', convId, 'messages'),
        orderBy('timestamp', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageRecord);
    } catch (err) {
      console.warn('Firestore listMessages failed, falling back to local storage:', err);
    }
  }
  return devRead<MessageRecord>(uid, `messages_${convId}`);
}

export async function addMessage(
  uid: string,
  convId: string,
  msg: { role: ChatMessage['role']; content: string },
): Promise<void> {
  const data = { ...msg, timestamp: isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      await addDoc(collection(db, 'users', uid, 'conversations', convId, 'messages'), data);
      return;
    } catch (err) {
      console.warn('Firestore addMessage failed, falling back to local storage:', err);
    }
  }
  const items = devRead<MessageRecord>(uid, `messages_${convId}`);
  items.push({ id: `msg-${Date.now()}`, ...data });
  devWrite(uid, `messages_${convId}`, items);
}
