import React from 'react';
import { Search, Plus, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ChatSession } from '../../types';

interface ConversationSidebarProps {
  filteredSessions: ChatSession[];
  currentSessionId: string;
  searchQuery: string;
  loaded: boolean;
  onNewChat: () => void;
  onSearchChange: (value: string) => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
}

export default function ConversationSidebar({
  filteredSessions,
  currentSessionId,
  searchQuery,
  loaded,
  onNewChat,
  onSearchChange,
  onSelectSession,
  onDeleteSession,
}: ConversationSidebarProps) {
  return (
    <div className="w-80 border-r border-slate-200 bg-white flex flex-col hidden md:flex">
      <div className="p-4 border-b border-slate-100 flex flex-col gap-3">
        <Button onClick={onNewChat} className="w-full h-10 flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            aria-label="Search chat history"
            placeholder="Search chat history..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
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
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
                session.id === currentSessionId
                  ? 'bg-brand-50 text-brand-800 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <button
                type="button"
                aria-current={session.id === currentSessionId ? 'true' : undefined}
                onClick={() => onSelectSession(session.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <MessageSquare
                  className={`h-4 w-4 shrink-0 ${session.id === currentSessionId ? 'text-brand-600' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span className="truncate">{session.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Delete conversation ${session.title}`}
                onClick={(e) => onDeleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
  );
}
