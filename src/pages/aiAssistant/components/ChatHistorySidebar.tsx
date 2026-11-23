import React from 'react';
import { MessageSquare, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ChatSession } from '../../../types';

interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  currentSessionId: string;
  loaded: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string, event: React.MouseEvent) => void;
}

function SidebarHeader({
  searchQuery,
  onSearchChange,
  onNewChat,
}: Pick<ChatHistorySidebarProps, 'searchQuery' | 'onSearchChange' | 'onNewChat'>) {
  return (
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
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 h-9 border-slate-200"
        />
      </div>
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string, event: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? 'bg-brand-50 text-brand-800 font-semibold'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelect(session.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <MessageSquare
          className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="truncate">{session.title}</span>
      </button>
      <button
        type="button"
        aria-label={`Delete conversation ${session.title}`}
        onClick={e => onDelete(session.id, e)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ChatHistorySidebar({
  sessions,
  currentSessionId,
  loaded,
  searchQuery,
  onSearchChange,
  onNewChat,
  onSelect,
  onDelete,
}: ChatHistorySidebarProps) {
  return (
    <div className="w-80 border-r border-slate-200 bg-white flex flex-col hidden md:flex">
      <SidebarHeader
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onNewChat={onNewChat}
      />
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
          Recent Conversations
        </p>
        {sessions.length > 0 ? (
          sessions.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              active={session.id === currentSessionId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
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
