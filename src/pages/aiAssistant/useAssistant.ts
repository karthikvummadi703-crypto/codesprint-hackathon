/**
 * Assistant page state: conversations, streaming replies, uploads, prompt
 * suggestions, and abortable chat requests.
 */
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { createSendMessage } from './sendMessage';
import { useAssistantFiles } from './useAssistantFiles';
import { useAssistantSession } from './useAssistantSession';

export function useAssistant() {
  const { user } = useAuth();
  const { location } = useLocation();
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  const files = useAssistantFiles({ user });
  const session = useAssistantSession({
    user,
    isLoading,
    setUploadedFiles: files.setUploadedFiles,
  });

  const handleSendMessage = createSendMessage({
    user,
    location,
    sessions: session.sessions,
    currentSessionId: session.currentSessionId,
    pendingAttachment: files.pendingAttachment,
    lifestyle: session.lifestyle,
    isLoading,
    ensureSession: session.ensureSession,
    setSessions: session.setSessions,
    setInputMessage,
    setPendingAttachment: files.setPendingAttachment,
    setAttachmentError: files.setAttachmentError,
    setIsLoading,
  });

  return {
    sessions: session.sessions,
    currentSessionId: session.currentSessionId,
    searchQuery: session.searchQuery,
    inputMessage,
    isLoading,
    showUploadPanel,
    loaded: session.loaded,
    uploadedFiles: files.uploadedFiles,
    uploadProgress: files.uploadProgress,
    pendingAttachment: files.pendingAttachment,
    attachmentError: files.attachmentError,
    dragActive: files.dragActive,
    activeSession: session.activeSession,
    filteredSessions: session.filteredSessions,
    fileInputRef: session.fileInputRef,
    attachInputRef: session.attachInputRef,
    messagesEndRef: session.messagesEndRef,
    setCurrentSessionId: session.setCurrentSessionId,
    setSearchQuery: session.setSearchQuery,
    setInputMessage,
    setShowUploadPanel,
    setDragActive: files.setDragActive,
    setPendingAttachment: files.setPendingAttachment,
    setAttachmentError: files.setAttachmentError,
    handleNewChat: session.handleNewChat,
    handleSendMessage,
    handleDeleteSession: session.handleDeleteSession,
    handleFileUpload: files.handleFileUpload,
    handleDeleteFile: files.handleDeleteFile,
    attachFile: files.attachFile,
    handleDrop: files.handleDrop,
  };
}
