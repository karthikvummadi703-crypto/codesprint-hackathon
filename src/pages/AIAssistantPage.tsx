import ChatComposer from './aiAssistant/components/ChatComposer';
import ChatHeader from './aiAssistant/components/ChatHeader';
import ChatHistorySidebar from './aiAssistant/components/ChatHistorySidebar';
import ChatMessages from './aiAssistant/components/ChatMessages';
import KnowledgeUploadPanel from './aiAssistant/components/KnowledgeUploadPanel';
import { AssistantController, useAssistant } from './aiAssistant/hooks/useAssistant';

function HistoryPane({ assistant }: { assistant: AssistantController }) {
  return (
    <ChatHistorySidebar
      sessions={assistant.filteredSessions}
      currentSessionId={assistant.currentSessionId}
      loaded={assistant.loaded}
      searchQuery={assistant.searchQuery}
      onSearchChange={assistant.setSearchQuery}
      onNewChat={() => void assistant.handleNewChat()}
      onSelect={assistant.setCurrentSessionId}
      onDelete={(id, event) => void assistant.handleDeleteSession(id, event)}
    />
  );
}

function MainColumn({ assistant }: { assistant: AssistantController }) {
  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <ChatHeader
        title={assistant.activeSession?.title || 'New Conversation'}
        showUploadPanel={assistant.showUploadPanel}
        uploadedCount={assistant.uploadedFiles.length}
        onToggleUploadPanel={() => assistant.setShowUploadPanel(!assistant.showUploadPanel)}
      />
      <ChatMessages
        activeSession={assistant.activeSession}
        isLoading={assistant.isLoading}
        messagesEndRef={assistant.messagesEndRef}
        onPrompt={text => void assistant.handleSendMessage(text)}
      />
      <ChatComposer
        dragActive={assistant.dragActive}
        setDragActive={assistant.setDragActive}
        onDrop={event => void assistant.handleDrop(event)}
        pendingAttachment={assistant.pendingAttachment}
        attachmentError={assistant.attachmentError}
        onRemoveAttachment={assistant.clearAttachment}
        attachInputRef={assistant.attachInputRef}
        onFileUpload={event => void assistant.handleFileUpload(event)}
        inputMessage={assistant.inputMessage}
        onInputChange={assistant.setInputMessage}
        onSend={text => void assistant.handleSendMessage(text)}
        isLoading={assistant.isLoading}
        uploadedFiles={assistant.uploadedFiles}
        onAttach={assistant.attachFile}
        hasMessages={Boolean(assistant.activeSession?.messages.length)}
      />
    </div>
  );
}

function UploadPane({ assistant }: { assistant: AssistantController }) {
  return (
    <KnowledgeUploadPanel
      uploadedFiles={assistant.uploadedFiles}
      uploadProgress={assistant.uploadProgress}
      fileInputRef={assistant.fileInputRef}
      onFileUpload={event => void assistant.handleFileUpload(event)}
      onDeleteFile={file => void assistant.handleDeleteFile(file)}
      onClose={() => assistant.setShowUploadPanel(false)}
    />
  );
}

function AssistantWorkspace({ assistant }: { assistant: AssistantController }) {
  return (
    <div className="flex-1 flex bg-white relative">
      <MainColumn assistant={assistant} />
      {assistant.showUploadPanel && <UploadPane assistant={assistant} />}
    </div>
  );
}

export default function AIAssistantPage() {
  const assistant = useAssistant();
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <h1 className="sr-only">AI Environmental Assistant</h1>
      <HistoryPane assistant={assistant} />
      <AssistantWorkspace assistant={assistant} />
    </div>
  );
}
