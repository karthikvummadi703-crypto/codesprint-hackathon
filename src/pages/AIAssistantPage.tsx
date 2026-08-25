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
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { SUGGESTED_PROMPTS } from '../services/mockAiService';
import { sendChatMessage, uploadDocumentForRag, deleteRagFile } from '../services/backendService';
import { uploadToStorage, deleteFromStorage, isStorageConfigured } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<KnowledgeFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
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
    const convoId = currentSessionId;
    if (!convoId || !user) return;

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
    setIsLoading(true);

    try {
      // Gather user context for richer AI responses
      let aqHistory: any[] = [];
      let carbonTrips: any[] = [];
      let predictions: any[] = [];
      let currentLocation = '';
      try {
        const [aqRecords, trips, preds] = await Promise.all([
          listAirQualityRecords(user.uid, 5),
          listCarbonTrips(user.uid),
          getLatestPredictions(user.uid),
        ]);
        aqHistory = aqRecords;
        carbonTrips = trips;
        predictions = preds;
        if (aqRecords.length > 0 && aqRecords[0].location) {
          currentLocation = aqRecords[0].location;
        }
      } catch {
        // Context loading is best-effort
      }

      const { response } = await sendChatMessage(text, { aqHistory, carbonTrips, predictions, currentLocation });
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

    for (const file of Array.from(files)) {
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
    if (file.ragFileId) {
      await deleteRagFile(file.ragFileId).catch(() => {});
    }
    if (file.name) {
      await deleteFromStorage(`users/${user.uid}/uploads/${file.name}`).catch(() => {});
    }
    await deleteUpload(user.uid, file.id).catch(() => {});
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
          <div className="p-4 border-t border-slate-200 bg-white shrink-0">
            <div className="max-w-3xl mx-auto flex gap-2">
              <Input
                type="text"
                placeholder="Type your message..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(inputMessage)}
                className="h-11 border-slate-200 pr-10"
              />
              <Button onClick={() => handleSendMessage(inputMessage)} className="h-11 px-4">
                <Send className="h-4.5 w-4.5" />
              </Button>
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