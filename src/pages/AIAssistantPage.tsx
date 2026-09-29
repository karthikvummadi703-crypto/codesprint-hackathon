import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Send,
  Paperclip,
  Trash2,
  FileText,
  AlertCircle,
  MessageSquare,
  HelpCircle,
  UploadCloud,
  File,
  X,
  CheckCircle,
  Wind,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { sendChatMessage, uploadDocumentForRag, deleteRagFile } from '../services/backendService';
import { uploadToStorage, deleteFromStorage, isStorageConfigured } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  listMessages,
  addMessage,
  listUploads,
  addUpload,
  deleteUpload,
  listAirQualityRecords,
  listCarbonTrips,
  getLatestPredictions,
} from '../services/dataService';
import { ChatSession, ChatMessage, KnowledgeFile } from '../types';

const SUGGESTED_PROMPTS = [
  'Summarize my environmental data',
  'Why is my AQI increasing?',
  'Analyze my uploaded report',
  'Compare my pollution history',
  'How can I reduce my carbon footprint?',
  'What are the health effects of PM2.5?',
];

function toChatMessage(raw: any): ChatMessage {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    timestamp: new Date(raw.timestamp),
  };
}

function toKnowledgeFile(raw: any): KnowledgeFile {
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

export default function AIAssistantPage() {
  const { user } = useAuth();
  const { location } = useLocation();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<KnowledgeFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  // Documents chosen for the next message. Kept separate from `uploadedFiles`
  // because the choice is per-message: the file is referenced by id in the chat
  // request, not silently added to the whole knowledge base.
  const [pendingAttachment, setPendingAttachment] = useState<KnowledgeFile | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === currentSessionId) || sessions[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isLoading]);

  const reloadData = useCallback(async () => {
    if (!user) return;
    try {
      const [convos, uploads] = await Promise.all([
        listConversations(user.uid),
        listUploads(user.uid),
      ]);
      const hydrated: ChatSession[] = [];
      for (const c of convos) {
        const msgs = await listMessages(user.uid, c.id);
        hydrated.push({
          id: c.id,
          title: c.title,
          messages: msgs.map(toChatMessage),
          updatedAt: new Date(c.updatedAt),
          createdAt: new Date(c.createdAt),
        });
      }
      setSessions(hydrated);
      setUploadedFiles(uploads.map(toKnowledgeFile));
      if (hydrated.length > 0) {
        setCurrentSessionId((prev) => prev || hydrated[0].id);
      } else {
        const newId = await createConversation(user.uid, 'New Conversation');
        const newSession: ChatSession = {
          id: newId,
          title: 'New Conversation',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setSessions([newSession]);
        setCurrentSessionId(newId);
      }
      setLoaded(true);
    } catch (e) {
      console.error('Failed to load conversations', e);
      // Still mark loaded: a failed load must not leave the sidebar stuck on
      // "Loading conversations." forever, and the composer is usable because a
      // session is now created on demand when the first message is sent.
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const handleNewChat = async () => {
    if (!user) return;
    let id = await createConversation(user.uid, 'New Conversation').catch(() => Date.now().toString());
    const newSession: ChatSession = {
      id: id,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!user) {
      setAttachmentError('Sign in to use the assistant.');
      return;
    }

    // The session is created on demand rather than required. Returning early
    // when none was ready made the composer silently swallow the question: the
    // initial load can fail (Firestore rules, offline, signed out) and then every
    // send was dropped with no message shown at all.
    let convoId = currentSessionId;
    if (!convoId || !sessions.some((s) => s.id === convoId)) {
      const newId = await createConversation(user.uid, 'New Conversation').catch(() => '');
      if (!newId) {
        setAttachmentError('Could not start a conversation. Please check your connection and try again.');
        return;
      }
      convoId = newId;
      const fresh: ChatSession = {
        id: newId,
        title: 'New Conversation',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSessions((prev) => (prev.some((s) => s.id === newId) ? prev : [fresh, ...prev]));
      setCurrentSessionId(newId);
      setLoaded(true);
    }

    // An attachment that has not finished indexing cannot be retrieved from, so
    // it is refused here rather than sent and silently ignored by the model.
    if (pendingAttachment && pendingAttachment.status !== 'ready') {
      setAttachmentError('Wait for the document to finish uploading before asking about it.');
      return;
    }

    const attachment = pendingAttachment;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    await addMessage(user.uid, convoId, { role: 'user', content: text });

    let currentTitle = sessions.find((s) => s.id === convoId)?.title || 'New Conversation';
    if (currentTitle === 'New Conversation') {
      currentTitle = text.slice(0, 30) + (text.length > 30 ? '...' : '');
      await updateConversation(user.uid, convoId, currentTitle).catch(() => {});
    }

    setSessions((prev) =>
      prev.map((s) =>
        s.id === convoId
          ? {
              ...s,
              title: s.title === 'New Conversation' ? currentTitle : s.title,
              messages: [...s.messages, userMsg],
              updatedAt: new Date(),
            }
          : s
      )
    );
    setInputMessage('');
    // The attachment applies to one message only; keeping it would silently
    // re-attach the same document to every later question in the chat.
    setPendingAttachment(null);
    setAttachmentError('');
    setIsLoading(true);

    try {
      // Gather user context for richer AI responses
      let aqHistory: any[] = [];
      let carbonTrips: any[] = [];
      let predictions: any[] = [];
      let pinnedLocation: {
        name?: string;
        latitude?: number;
        longitude?: number;
        region?: string;
        country?: string;
      } | undefined = location
        ? {
            name: location.name,
            latitude: location.latitude,
            longitude: location.longitude,
            region: location.region,
            country: location.country,
          }
        : undefined;
      try {
        const [aqRecords, trips, preds] = await Promise.all([
          listAirQualityRecords(user.uid, 5),
          listCarbonTrips(user.uid),
          getLatestPredictions(user.uid),
        ]);
        aqHistory = aqRecords;
        carbonTrips = trips;
        predictions = preds;
        // Only fall back to a stored record when nothing is pinned, so the
        // assistant never answers about a stale location by default.
        if (!pinnedLocation && aqRecords.length > 0 && aqRecords[0].location) {
          pinnedLocation = { name: aqRecords[0].location };
        }
      } catch {
        // Context loading is best-effort
      }

      const { response } = await sendChatMessage(text, {
        location: pinnedLocation,
        aqHistory,
        carbonTrips,
        predictions,
        // Only the file chosen for this turn is passed. The backend resolves
        // the id inside the caller's own knowledge base, so an id belonging to
        // someone else retrieves nothing.
        documentIds: attachment?.ragFileId ? [attachment.ragFileId] : undefined,
        history: (activeSession?.messages ?? [])
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content })),
      });
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      await addMessage(user.uid, convoId, { role: 'assistant', content: response }).catch(() => {});
      setSessions((prev) =>
        prev.map((s) =>
          s.id === convoId
            ? { ...s, messages: [...s.messages, aiMsg], updatedAt: new Date() }
            : s
        )
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ I couldn't reach the AI service (${msg}). Please make sure the backend is running (uvicorn main:app --reload --port 8001) and try again.`,
        timestamp: new Date(),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === convoId ? { ...s, messages: [...s.messages, aiMsg] } : s
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== id);
    setSessions(filtered);
    if (currentSessionId === id) {
      setCurrentSessionId(filtered.length > 0 ? filtered[0].id : '');
    }
    if (user) await deleteConversation(user.uid, id).catch(() => {});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    e.target.value = '';
    await uploadFiles(Array.from(files));
  };

  const uploadFiles = async (incoming: File[]) => {
    if (!user) return;
    for (const file of incoming) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension !== 'pdf' && extension !== 'csv' && extension !== 'txt') {
        alert('Invalid file format. Please upload PDF, CSV, or TXT.');
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('File is larger than 10MB. Please upload a smaller file.');
        continue;
      }

      const fileId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
      const newFile: KnowledgeFile = {
        id: fileId,
        name: file.name,
        type: extension as 'pdf' | 'csv' | 'txt',
        size: file.size,
        uploadedAt: new Date(),
        status: 'processing',
      };

      setUploadedFiles((prev) => [newFile, ...prev]);
      setUploadProgress((prev) => ({ ...prev, [fileId]: 5 }));

      let ragSucceeded = false;
      try {
        const storagePromise = isStorageConfigured()
          ? uploadToStorage(user.uid, file.name, file, (pct) => {
              setUploadProgress((prev) => ({ ...prev, [fileId]: Math.max(prev[fileId] || 5, pct) }));
            })
          : Promise.resolve(null);
        const ragPromise = uploadDocumentForRag(file);
        const [ragResult, storageUrl] = await Promise.all([
          ragPromise,
          storagePromise.catch(() => null),
        ]);
        ragSucceeded = true;
        setUploadProgress((prev) => ({ ...prev, [fileId]: 100 }));
        await addUpload(user.uid, {
          fileId: fileId,
          name: file.name,
          type: extension,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          status: 'ready',
          ragFileId: ragResult?.fileId || null,
          storagePath: storageUrl ? `users/${user.uid}/uploads/${file.name}` : null,
        }).catch(() => {});
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: 'ready', ragFileId: ragResult?.fileId } : f
          )
        );
      } catch (err) {
        ragSucceeded = false;
        const msg = err instanceof Error ? err.message : String(err);
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, status: 'error' } : f))
        );
        alert(`Upload failed: ${msg}. Make sure the backend is running.`);
      } finally {
        if (!ragSucceeded) {
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[fileId];
            return next;
          });
        }
      }
    }
  };

  const handleDeleteFile = async (file: KnowledgeFile) => {
    if (!user) return;
    setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
    // Drop it from the composer too, otherwise the next message would
    // reference a document that no longer exists.
    setPendingAttachment((prev) => (prev?.id === file.id ? null : prev));
    if (file.ragFileId) {
      await deleteRagFile(file.ragFileId).catch(() => {});
    }
    if (file.name) {
      await deleteFromStorage(`users/${user.uid}/uploads/${file.name}`).catch(() => {});
    }
    await deleteUpload(user.uid, file.id).catch(() => {});
  };

  /** Attach an already-indexed document to the next message. */
  const attachFile = (file: KnowledgeFile) => {
    if (file.status !== 'ready') {
      setAttachmentError('That document is still being indexed.');
      return;
    }
    setPendingAttachment(file);
    setAttachmentError('');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    await uploadFiles(dropped);
    // A single dropped file is also staged for the current message, which is
    // what makes drag-and-drop usable for "what does this report say?".
    const first = uploadedFiles.find((f) => f.name === dropped[0]?.name);
    if (first && first.status === 'ready') setPendingAttachment(first);
  };

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Secondary sidebar - Chat history */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3">
          <Button onClick={handleNewChat} className="w-full h-10 flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> New Chat
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search chat history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 border-slate-200"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Recent Conversations
          </p>
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                  session.id === currentSessionId
                    ? 'bg-brand-50 text-brand-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MessageSquare className={`h-4 w-4 shrink-0 ${session.id === currentSessionId ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span className="truncate">{session.title}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center text-xs text-slate-400 py-8">
              {loaded ? 'No chats found' : 'Loading conversations…'}
            </div>
          )}
        </div>
      </div>

      {/* Main chat layout */}
      <div className="flex-1 flex bg-white relative">
        <div className="flex-1 flex flex-col h-full min-w-0">
          {/* Chat Header */}
          <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {activeSession?.title || 'New Conversation'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">AirGuard Intelligent Environmental Assistant</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={showUploadPanel ? 'secondary' : 'outline'}
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setShowUploadPanel(!showUploadPanel)}
              >
                <Paperclip className="h-4 w-4" />
                Knowledge Base ({uploadedFiles.length})
              </Button>
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {activeSession?.messages.length === 0 ? (
              <div className="max-w-xl mx-auto text-center py-16 space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center mx-auto shadow-sm">
                  <Wind className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Ask AirGuard AI</h3>
                  <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                    Ask me anything about air quality trends, forecasts, environmental reports, or carbon footprint reductions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6 text-left">
                  {SUGGESTED_PROMPTS.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      onClick={() => handleSendMessage(p)}
                      className="p-3 border border-slate-200 hover:border-brand-400 bg-white rounded-xl text-xs text-slate-600 hover:text-brand-900 transition-colors shadow-sm"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6">
                {activeSession?.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.role !== 'user' && (
                      <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        A
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-brand-600 text-white rounded-tr-none'
                          : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <div className="whitespace-pre-line">{m.content}</div>
                      <div
                        className={`text-[10px] mt-1.5 ${
                          m.role === 'user' ? 'text-brand-200 text-right' : 'text-slate-400'
                        }`}
                      >
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-4 justify-start">
                    <div className="h-8 w-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                      A
                    </div>
                    <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Chat input */}
          <div
            className={`p-4 border-t bg-white shrink-0 transition-colors ${
              dragActive ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragActive(false);
            }}
            onDrop={handleDrop}
          >
            <div className="max-w-3xl mx-auto">
              {dragActive && (
                <p className="text-xs text-brand-700 font-semibold text-center pb-2">
                  Drop a PDF, CSV or TXT to add it to your knowledge base
                </p>
              )}

              {/* Selected document for the next message */}
              {pendingAttachment && (
                <div className="flex items-center gap-2 mb-2 text-xs bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                  <Paperclip className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                  <span className="font-semibold text-brand-900 truncate">
                    {pendingAttachment.name}
                  </span>
                  <span className="text-brand-600 shrink-0">
                    {(pendingAttachment.size / 1024).toFixed(0)} KB
                  </span>
                  {pendingAttachment.status === 'ready' ? (
                    <span className="text-[10px] text-emerald-600">indexed</span>
                  ) : (
                    <span className="text-[10px] text-amber-600 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" /> indexing
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setPendingAttachment(null);
                      setAttachmentError('');
                    }}
                    className="ml-auto p-0.5 rounded text-brand-500 hover:text-brand-700"
                    title="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {attachmentError && (
                <p className="text-[11px] text-red-600 mb-2 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> {attachmentError}
                </p>
              )}

              <div className="flex gap-2 items-end">
                <button
                  type="button"
                  onClick={() => attachInputRef.current?.click()}
                  className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
                  title="Attach a document to this message"
                >
                  <Paperclip className="h-4.5 w-4.5" />
                </button>
                <input
                  type="file"
                  ref={attachInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.csv,.txt"
                  className="hidden"
                />
                <Input
                  type="text"
                  placeholder={
                    pendingAttachment
                      ? `Ask about ${pendingAttachment.name}…`
                      : 'Type your message, or drop a report here…'
                  }
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends. Without preventDefault the browser also
                    // inserts a newline / submits, so the message appeared to be
                    // typed but never sent.
                    if (e.key !== 'Enter' || e.shiftKey) return;
                    e.preventDefault();
                    if (inputMessage.trim()) void handleSendMessage(inputMessage);
                  }}
                  className="h-11 border-slate-200 pr-10"
                />
                <Button
                  onClick={() => handleSendMessage(inputMessage)}
                  disabled={!inputMessage.trim() || isLoading}
                  className="h-11 px-4"
                >
                  <Send className="h-4.5 w-4.5" />
                </Button>
              </div>

              {uploadedFiles.filter((f) => f.status === 'ready').length > 0 && (
                <div className="mt-2 flex items-center gap-2 overflow-x-auto">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
                    Ask about
                  </span>
                  {uploadedFiles
                    .filter((f) => f.status === 'ready')
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() => attachFile(f)}
                        className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                          pendingAttachment?.id === f.id
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {activeSession?.messages.length > 0 && (
              <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto py-2 shrink-0 mt-1">
                {SUGGESTED_PROMPTS.slice(0, 3).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSendMessage(p)}
                    className="shrink-0 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Knowledge Upload Sidebar panel */}
        {showUploadPanel && (
          <div className="w-80 border-l border-slate-200 h-full flex flex-col bg-white z-10 shrink-0">
            <div className="h-16 border-b border-slate-100 flex items-center justify-between px-5 shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">Knowledge Uploads</h3>
              <button onClick={() => setShowUploadPanel(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 shrink-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-brand-50/20"
              >
                <UploadCloud className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <span className="text-xs font-semibold text-slate-700 block">Upload environmental report</span>
                <span className="text-[10px] text-slate-400 mt-1 block">PDF, CSV, TXT (Max 10MB)</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,.csv,.txt"
                  className="hidden"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Document Base ({uploadedFiles.length})
              </p>
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="group flex items-start justify-between p-3 border border-slate-100 rounded-xl hover:border-slate-200"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      {file.type === 'pdf' ? (
                        <FileText className="h-4.5 w-4.5" />
                      ) : (
                        <File className="h-4.5 w-4.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type.toUpperCase()}
                      </div>
                      {uploadProgress[file.id] !== undefined && file.status === 'processing' && (
                        <div className="w-32 h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all"
                            style={{ width: `${Math.min(uploadProgress[file.id] || 10, 100)}%` }}
                          />
                        </div>
                      )}
                      {file.status === 'error' && (
                        <div className="text-[10px] text-red-500 mt-0.5">Failed to process</div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {file.status === 'processing' ? (
                      <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    ) : file.status === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    )}
                    <button
                      onClick={() => handleDeleteFile(file)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                      title="Delete file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {uploadedFiles.length === 0 && (
                <div className="text-center text-xs text-slate-400 py-8">
                  No documents yet. Upload a report to analyze with AI.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}