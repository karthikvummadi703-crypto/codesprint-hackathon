import React from 'react';
import { AlertCircle, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { KnowledgeFile } from '../../../types';
import { SUGGESTED_PROMPTS } from '../modules/chat';

interface ChatComposerProps {
  dragActive: boolean;
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  onDrop: (event: React.DragEvent) => void;
  pendingAttachment: KnowledgeFile | null;
  attachmentError: string;
  onRemoveAttachment: () => void;
  attachInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
  isLoading: boolean;
  uploadedFiles: KnowledgeFile[];
  onAttach: (file: KnowledgeFile) => void;
  hasMessages: boolean;
}

function AttachmentChip({ file, onRemove }: { file: KnowledgeFile; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-2 text-xs bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
      <Paperclip className="h-3.5 w-3.5 text-brand-600 shrink-0" />
      <span className="font-semibold text-brand-900 truncate">{file.name}</span>
      <span className="text-brand-600 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
      {file.status === 'ready' ? (
        <span className="text-[10px] text-emerald-600">indexed</span>
      ) : (
        <span className="text-[10px] text-amber-600 flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" /> indexing
        </span>
      )}
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="ml-auto p-0.5 rounded text-brand-500 hover:text-brand-700"
        title="Remove attachment"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function AttachButton({
  attachInputRef,
  onFileUpload,
}: Pick<ChatComposerProps, 'attachInputRef' | 'onFileUpload'>) {
  return (
    <>
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
    </>
  );
}

function MessageInput({
  pendingAttachment,
  inputMessage,
  onInputChange,
  onSend,
}: Pick<ChatComposerProps, 'pendingAttachment' | 'inputMessage' | 'onInputChange' | 'onSend'>) {
  return (
    <Input
      type="text"
      aria-label="Message AirGuard AI"
      placeholder={
        pendingAttachment
          ? `Ask about ${pendingAttachment.name}…`
          : 'Type your message, or drop a report here…'
      }
      value={inputMessage}
      onChange={e => onInputChange(e.target.value)}
      onKeyDown={e => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        if (inputMessage.trim()) void onSend(inputMessage);
      }}
      className="h-11 border-slate-200 pr-10"
    />
  );
}

function SendButton({
  inputMessage,
  isLoading,
  onSend,
}: Pick<ChatComposerProps, 'inputMessage' | 'isLoading' | 'onSend'>) {
  return (
    <Button
      aria-label="Send message"
      onClick={() => onSend(inputMessage)}
      disabled={!inputMessage.trim() || isLoading}
      className="h-11 px-4"
    >
      <Send className="h-4.5 w-4.5" aria-hidden="true" />
    </Button>
  );
}

function ComposerRow(props: ChatComposerProps) {
  return (
    <div className="flex gap-2 items-end">
      <AttachButton attachInputRef={props.attachInputRef} onFileUpload={props.onFileUpload} />
      <MessageInput
        pendingAttachment={props.pendingAttachment}
        inputMessage={props.inputMessage}
        onInputChange={props.onInputChange}
        onSend={props.onSend}
      />
      <SendButton
        inputMessage={props.inputMessage}
        isLoading={props.isLoading}
        onSend={props.onSend}
      />
    </div>
  );
}

function ReadyFileChips({
  files,
  pendingAttachment,
  onAttach,
}: {
  files: KnowledgeFile[];
  pendingAttachment: KnowledgeFile | null;
  onAttach: (file: KnowledgeFile) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-2 overflow-x-auto">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
        Ask about
      </span>
      {files.map(f => (
        <button
          key={f.id}
          onClick={() => onAttach(f)}
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
  );
}

function SuggestedPromptChips({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto py-2 shrink-0 mt-1">
      {SUGGESTED_PROMPTS.slice(0, 3).map(p => (
        <button
          key={p}
          onClick={() => onSend(p)}
          className="shrink-0 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full transition-colors"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function ComposerFrame({
  dragActive,
  setDragActive,
  onDrop,
  children,
}: Pick<ChatComposerProps, 'dragActive' | 'setDragActive' | 'onDrop'> & {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`p-4 border-t bg-white shrink-0 transition-colors ${
        dragActive ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200'
      }`}
      onDragOver={e => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}

export default function ChatComposer(props: ChatComposerProps) {
  const readyFiles = props.uploadedFiles.filter(f => f.status === 'ready');
  return (
    <ComposerFrame
      dragActive={props.dragActive}
      setDragActive={props.setDragActive}
      onDrop={props.onDrop}
    >
      <div className="max-w-3xl mx-auto">
        {props.dragActive && (
          <p className="text-xs text-brand-700 font-semibold text-center pb-2">
            Drop a PDF, CSV or TXT to add it to your knowledge base
          </p>
        )}
        {props.pendingAttachment && (
          <AttachmentChip file={props.pendingAttachment} onRemove={props.onRemoveAttachment} />
        )}
        {props.attachmentError && (
          <p role="alert" className="text-[11px] text-red-600 mb-2 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {props.attachmentError}
          </p>
        )}
        <ComposerRow {...props} />
        <ReadyFileChips
          files={readyFiles}
          pendingAttachment={props.pendingAttachment}
          onAttach={props.onAttach}
        />
      </div>
      {props.hasMessages && <SuggestedPromptChips onSend={props.onSend} />}
    </ComposerFrame>
  );
}
