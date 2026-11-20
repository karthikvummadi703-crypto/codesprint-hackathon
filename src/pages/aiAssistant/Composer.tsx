import React from 'react';
import { AlertCircle, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { KnowledgeFile } from '../../types';
import { SUGGESTED_PROMPTS } from './constants';

interface ComposerProps {
  dragActive: boolean;
  pendingAttachment: KnowledgeFile | null;
  attachmentError: string;
  inputMessage: string;
  isLoading: boolean;
  uploadedFiles: KnowledgeFile[];
  hasMessages: boolean;
  attachInputRef: React.RefObject<HTMLInputElement | null>;
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingAttachment: React.Dispatch<React.SetStateAction<KnowledgeFile | null>>;
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  onDrop: (e: React.DragEvent) => Promise<void>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSendMessage: (text: string) => void;
  onAttachFile: (file: KnowledgeFile) => void;
}

export default function Composer({
  dragActive,
  pendingAttachment,
  attachmentError,
  inputMessage,
  isLoading,
  uploadedFiles,
  hasMessages,
  attachInputRef,
  setDragActive,
  setPendingAttachment,
  setAttachmentError,
  setInputMessage,
  onDrop,
  onFileUpload,
  onSendMessage,
  onAttachFile,
}: ComposerProps) {
  return (
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
      onDrop={onDrop}
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
            <span className="font-semibold text-brand-900 truncate">{pendingAttachment.name}</span>
            <span className="text-brand-600 shrink-0">{(pendingAttachment.size / 1024).toFixed(0)} KB</span>
            {pendingAttachment.status === 'ready' ? (
              <span className="text-[10px] text-emerald-600">indexed</span>
            ) : (
              <span className="text-[10px] text-amber-600 flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" /> indexing
              </span>
            )}
            <button
              type="button"
              aria-label="Remove attachment"
              onClick={() => {
                setPendingAttachment(null);
                setAttachmentError('');
              }}
              className="ml-auto p-0.5 rounded text-brand-500 hover:text-brand-700"
              title="Remove attachment"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {attachmentError && (
          <p role="alert" className="text-[11px] text-red-600 mb-2 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {attachmentError}
          </p>
        )}

        <div className="flex gap-2 items-end">
          <button
            type="button"
            aria-label="Attach a document to this message"
            onClick={() => attachInputRef.current?.click()}
            className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-brand-600 hover:border-brand-300 transition-colors"
            title="Attach a document to this message"
          >
            <Paperclip className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
          <input
            type="file"
            ref={attachInputRef}
            onChange={onFileUpload}
            accept=".pdf,.csv,.txt"
            className="hidden"
          />
          <Input
            type="text"
            aria-label="Message AirGuard AI"
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
              if (inputMessage.trim()) void onSendMessage(inputMessage);
            }}
            className="h-11 border-slate-200 pr-10"
          />
          <Button
            aria-label="Send message"
            onClick={() => onSendMessage(inputMessage)}
            disabled={!inputMessage.trim() || isLoading}
            className="h-11 px-4"
          >
            <Send className="h-4.5 w-4.5" aria-hidden="true" />
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
                  onClick={() => onAttachFile(f)}
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
      {hasMessages && (
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto py-2 shrink-0 mt-1">
          {SUGGESTED_PROMPTS.slice(0, 3).map((p) => (
            <button
              key={p}
              onClick={() => onSendMessage(p)}
              className="shrink-0 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
