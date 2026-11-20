import React from 'react';
import { AlertCircle, CheckCircle, File, FileText, Trash2, UploadCloud, X } from 'lucide-react';
import { KnowledgeFile } from '../../types';

interface KnowledgePanelProps {
  uploadedFiles: KnowledgeFile[];
  uploadProgress: { [key: string]: number };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDeleteFile: (file: KnowledgeFile) => void;
}

export default function KnowledgePanel({
  uploadedFiles,
  uploadProgress,
  fileInputRef,
  onClose,
  onFileUpload,
  onDeleteFile,
}: KnowledgePanelProps) {
  return (
    <div className="w-80 border-l border-slate-200 h-full flex flex-col bg-white z-10 shrink-0">
      <div className="h-16 border-b border-slate-100 flex items-center justify-between px-5 shrink-0">
        <h3 className="font-bold text-slate-800 text-sm">Knowledge Uploads</h3>
        <button
          type="button"
          aria-label="Close knowledge uploads"
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded-lg"
        >
          <X className="h-4 w-4 text-slate-500" aria-hidden="true" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-100 shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload environmental report"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="border-2 border-dashed border-slate-200 hover:border-brand-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-brand-50/20"
        >
          <UploadCloud className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <span className="text-xs font-semibold text-slate-700 block">Upload environmental report</span>
          <span className="text-[10px] text-slate-400 mt-1 block">PDF, CSV, TXT (Max 10MB)</span>
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileUpload}
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
                type="button"
                aria-label={`Delete ${file.name}`}
                onClick={() => onDeleteFile(file)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                title="Delete file"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
  );
}
