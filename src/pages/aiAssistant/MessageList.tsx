import React from 'react';
import { Wind } from 'lucide-react';
import { ChatSession } from '../../types';
import { SUGGESTED_PROMPTS } from './constants';

interface MessageListProps {
  activeSession: ChatSession | undefined;
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSendMessage: (text: string) => void;
}

export default function MessageList({
  activeSession,
  isLoading,
  messagesEndRef,
  onSendMessage,
}: MessageListProps) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
      className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50"
    >
      {activeSession?.messages.length === 0 ? (
        <div className="max-w-xl mx-auto text-center py-16 space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center mx-auto shadow-sm">
            <Wind className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Ask AirGuard AI</h3>
            <p className="text-slate-500 text-sm mt-1 leading-relaxed">
              Ask me anything about air quality trends, forecasts, environmental reports, or carbon footprint
              reductions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-6 text-left">
            {SUGGESTED_PROMPTS.slice(0, 4).map((p) => (
              <button
                key={p}
                onClick={() => onSendMessage(p)}
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
            <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
              <div
                role="status"
                aria-label="Assistant is typing"
                className="bg-white border border-slate-100 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-1"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}
