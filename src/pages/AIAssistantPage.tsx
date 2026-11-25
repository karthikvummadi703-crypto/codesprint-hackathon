/**
 * Assistant route composing conversation history, messages, and composer.
 */
import { Paperclip } from 'lucide-react';
import { Button } from '../components/ui/Button';
import ConversationSidebar from './aiAssistant/ConversationSidebar';
import MessageList from './aiAssistant/MessageList';
import Composer from './aiAssistant/Composer';
import KnowledgePanel from './aiAssistant/KnowledgePanel';
import { useAssistant } from './aiAssistant/useAssistant';

export default function AIAssistantPage() {
  const {
    currentSessionId,
    searchQuery,
    inputMessage,
    isLoading,
    showUploadPanel,
    loaded,
    uploadedFiles,
    uploadProgress,
    pendingAttachment,
    attachmentError,
    dragActive,
    activeSession,
    filteredSessions,
    fileInputRef,
    attachInputRef,
    messagesEndRef,
    setCurrentSessionId,
    setSearchQuery,
    setInputMessage,
    setShowUploadPanel,
    setDragActive,
    setPendingAttachment,
    setAttachmentError,
    handleNewChat,
    handleSendMessage,
    handleDeleteSession,
    handleFileUpload,
    handleDeleteFile,
    attachFile,
    handleDrop,
  } = useAssistant();

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <h1 className="sr-only">AI Environmental Assistant</h1>
      {/* Secondary sidebar - Chat history */}
      <ConversationSidebar
        filteredSessions={filteredSessions}
        currentSessionId={currentSessionId}
        searchQuery={searchQuery}
        loaded={loaded}
        onNewChat={handleNewChat}
        onSearchChange={setSearchQuery}
        onSelectSession={setCurrentSessionId}
        onDeleteSession={handleDeleteSession}
      />

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
          <MessageList
            activeSession={activeSession}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onSendMessage={handleSendMessage}
          />

          {/* Chat input */}
          <Composer
            dragActive={dragActive}
            pendingAttachment={pendingAttachment}
            attachmentError={attachmentError}
            inputMessage={inputMessage}
            isLoading={isLoading}
            uploadedFiles={uploadedFiles}
            hasMessages={activeSession?.messages.length > 0}
            attachInputRef={attachInputRef}
            setDragActive={setDragActive}
            setPendingAttachment={setPendingAttachment}
            setAttachmentError={setAttachmentError}
            setInputMessage={setInputMessage}
            onDrop={handleDrop}
            onFileUpload={handleFileUpload}
            onSendMessage={handleSendMessage}
            onAttachFile={attachFile}
          />
        </div>

        {/* Knowledge Upload Sidebar panel */}
        {showUploadPanel && (
          <KnowledgePanel
            uploadedFiles={uploadedFiles}
            uploadProgress={uploadProgress}
            fileInputRef={fileInputRef}
            onClose={() => setShowUploadPanel(false)}
            onFileUpload={handleFileUpload}
            onDeleteFile={handleDeleteFile}
          />
        )}
      </div>
    </div>
  );
}
