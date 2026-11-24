import { createRef, type ChangeEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AIAssistantPage from '../AIAssistantPage';
import { useAssistant } from '../aiAssistant/useAssistant';
import type { ChatMessage, ChatSession, KnowledgeFile } from '../../types';

const spies = vi.hoisted(() => ({
  setCurrentSessionId: vi.fn(),
  setSearchQuery: vi.fn(),
  setInputMessage: vi.fn(),
  setShowUploadPanel: vi.fn(),
  setDragActive: vi.fn(),
  setPendingAttachment: vi.fn(),
  setAttachmentError: vi.fn(),
  handleNewChat: vi.fn(),
  handleSendMessage: vi.fn(),
  handleDeleteSession: vi.fn(),
  handleFileUpload: vi.fn(async () => undefined),
  handleDeleteFile: vi.fn(async () => undefined),
  attachFile: vi.fn(),
  handleDrop: vi.fn(async () => undefined),
}));

vi.mock('../aiAssistant/useAssistant', () => ({ useAssistant: vi.fn() }));

interface ComposerStubProps {
  dragActive: boolean;
  pendingAttachment: KnowledgeFile | null;
  attachmentError: string;
  inputMessage: string;
  isLoading: boolean;
  uploadedFiles: KnowledgeFile[];
  setInputMessage: (message: string) => void;
  setPendingAttachment: (file: KnowledgeFile | null) => void;
  setAttachmentError: (message: string) => void;
  onSendMessage: (text: string) => void;
  onAttachFile: (file: KnowledgeFile) => void;
}

vi.mock('../aiAssistant/Composer', () => ({
  default: ({
    dragActive,
    pendingAttachment,
    attachmentError,
    inputMessage,
    isLoading,
    uploadedFiles,
    setInputMessage,
    setPendingAttachment,
    setAttachmentError,
    onSendMessage,
    onAttachFile,
  }: ComposerStubProps) => (
    <div>
      {dragActive && <p>Drop a PDF, CSV or TXT to add it to your knowledge base</p>}
      {pendingAttachment && (
        <div>
          <span>{pendingAttachment.name}</span>
          <button
            type="button"
            aria-label="Remove attachment"
            onClick={() => {
              setPendingAttachment(null);
              setAttachmentError('');
            }}
          >
            Remove
          </button>
        </div>
      )}
      {attachmentError && <p role="alert">{attachmentError}</p>}
      <input
        aria-label="Message AirGuard AI"
        placeholder={
          pendingAttachment
            ? `Ask about ${pendingAttachment.name}…`
            : 'Type your message, or drop a report here…'
        }
        value={inputMessage}
        onChange={(event) => setInputMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSendMessage(inputMessage);
        }}
      />
      <button
        type="button"
        aria-label="Send message"
        disabled={!inputMessage.trim() || isLoading}
        onClick={() => onSendMessage(inputMessage)}
      >
        Send
      </button>
      {uploadedFiles
        .filter((file) => file.status === 'ready')
        .map((file) => (
          <button type="button" key={file.id} onClick={() => onAttachFile(file)}>
            {file.name}
          </button>
        ))}
    </div>
  ),
}));

interface KnowledgePanelStubProps {
  uploadedFiles: KnowledgeFile[];
  onClose: () => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDeleteFile: (file: KnowledgeFile) => void;
}

vi.mock('../aiAssistant/KnowledgePanel', () => ({
  default: ({ uploadedFiles, onClose, onFileUpload, onDeleteFile }: KnowledgePanelStubProps) => (
    <aside>
      <h3>Knowledge Uploads</h3>
      <button type="button" aria-label="Close knowledge uploads" onClick={onClose}>
        Close
      </button>
      <label>
        Upload environmental report
        <input type="file" multiple onChange={(event) => void onFileUpload(event)} />
      </label>
      <p>Document Base ({uploadedFiles.length})</p>
      {uploadedFiles.map((file) => (
        <div key={file.id}>
          <span>{file.name}</span>
          <button type="button" aria-label={`Delete ${file.name}`} onClick={() => onDeleteFile(file)}>
            Delete
          </button>
        </div>
      ))}
      {uploadedFiles.length === 0 && <p>No documents yet. Upload a report to analyze with AI.</p>}
    </aside>
  ),
}));

type AssistantState = ReturnType<typeof useAssistant>;

const message: ChatMessage = {
  id: 'message-1',
  role: 'user',
  content: 'How is the air today?',
  timestamp: new Date('2026-11-24T08:30:00.000Z'),
};

const session: ChatSession = {
  id: 'session-1',
  title: 'Morning air',
  messages: [message],
  createdAt: new Date('2026-11-24T08:29:00.000Z'),
  updatedAt: new Date('2026-11-24T08:30:00.000Z'),
};

const emptySession: ChatSession = {
  ...session,
  id: 'session-empty',
  title: 'New Conversation',
  messages: [],
};

const otherSession: ChatSession = {
  id: 'session-2',
  title: 'Winter smog plan',
  messages: [],
  createdAt: new Date('2026-11-23T08:29:00.000Z'),
  updatedAt: new Date('2026-11-23T08:30:00.000Z'),
};

const report: KnowledgeFile = {
  id: 'file-1',
  name: 'report.pdf',
  type: 'pdf',
  size: 2048,
  uploadedAt: new Date('2026-11-20T10:00:00.000Z'),
  status: 'ready',
  ragFileId: 'rag-1',
};

const processingFile: KnowledgeFile = {
  id: 'file-2',
  name: 'measurements.csv',
  type: 'csv',
  size: 4096,
  uploadedAt: new Date('2026-11-21T10:00:00.000Z'),
  status: 'processing',
};

function assistantState(overrides: Partial<AssistantState> = {}): AssistantState {
  const base: AssistantState = {
    sessions: [session, otherSession],
    currentSessionId: session.id,
    searchQuery: '',
    inputMessage: '',
    isLoading: false,
    showUploadPanel: false,
    loaded: true,
    uploadedFiles: [report],
    uploadProgress: {},
    pendingAttachment: null,
    attachmentError: '',
    dragActive: false,
    activeSession: session,
    filteredSessions: [session, otherSession],
    fileInputRef: createRef<HTMLInputElement>(),
    attachInputRef: createRef<HTMLInputElement>(),
    messagesEndRef: createRef<HTMLDivElement>(),
    setCurrentSessionId: spies.setCurrentSessionId,
    setSearchQuery: spies.setSearchQuery,
    setInputMessage: spies.setInputMessage,
    setShowUploadPanel: spies.setShowUploadPanel,
    setDragActive: spies.setDragActive,
    setPendingAttachment: spies.setPendingAttachment,
    setAttachmentError: spies.setAttachmentError,
    handleNewChat: spies.handleNewChat,
    handleSendMessage: spies.handleSendMessage,
    handleDeleteSession: spies.handleDeleteSession,
    handleFileUpload: spies.handleFileUpload,
    handleDeleteFile: spies.handleDeleteFile,
    attachFile: spies.attachFile,
    handleDrop: spies.handleDrop,
  };
  return { ...base, ...overrides };
}

async function expectZeroViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAssistant).mockReturnValue(assistantState());
});

describe('AIAssistantPage', () => {
  it('shows the conversation loading state and the empty composer', async () => {
    vi.mocked(useAssistant).mockReturnValue(
      assistantState({
        sessions: [],
        filteredSessions: [],
        activeSession: undefined,
        currentSessionId: '',
        uploadedFiles: [],
        loaded: false,
      }),
    );
    const { container } = render(<AIAssistantPage />);

    expect(screen.getByText('Loading conversations…')).toBeInTheDocument();
    expect(screen.queryByText('No chats found')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New Conversation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Knowledge Base (0)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message AirGuard AI' })).toBeInTheDocument();
    await expectZeroViolations(container);
  });

  it('renders the active conversation, messages and ready knowledge files', async () => {
    const { container } = render(<AIAssistantPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'AI Environmental Assistant' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Morning air' })).toBeInTheDocument();
    expect(screen.getByText('AirGuard Intelligent Environmental Assistant')).toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Chat messages' })).toHaveTextContent('How is the air today?');
    expect(screen.getByRole('button', { name: 'Knowledge Base (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'report.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await expectZeroViolations(container);
  });

  it('shows the empty chat state and sends a suggested prompt', async () => {
    vi.mocked(useAssistant).mockReturnValue(
      assistantState({ sessions: [], filteredSessions: [], activeSession: emptySession, uploadedFiles: [] }),
    );
    const user = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    expect(screen.getByText('No chats found')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ask AirGuard AI' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', {
        name: /Summarize my environmental data|Why is my AQI increasing\?|Analyze my uploaded report|Compare my pollution history/,
      }),
    ).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Why is my AQI increasing?' }));

    expect(spies.handleSendMessage).toHaveBeenCalledWith('Why is my AQI increasing?');
    await expectZeroViolations(container);
  });

  it('wires new chat, history search, session selection and deletion', async () => {
    const user = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    await user.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(spies.handleNewChat).toHaveBeenCalledTimes(1);

    const search = screen.getByRole('textbox', { name: 'Search chat history' });
    fireEvent.change(search, { target: { value: 'smog' } });
    expect(spies.setSearchQuery).toHaveBeenCalledWith('smog');

    await user.click(screen.getByRole('button', { name: 'Winter smog plan' }));
    expect(spies.setCurrentSessionId).toHaveBeenCalledWith('session-2');

    await user.click(screen.getByRole('button', { name: 'Delete conversation Morning air' }));
    expect(spies.handleDeleteSession).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ type: 'click' }),
    );
    await expectZeroViolations(container);
  });

  it('wires composer input, sending, attachment removal and attachment selection', async () => {
    vi.mocked(useAssistant).mockReturnValue(
      assistantState({
        inputMessage: 'Will it rain?',
        pendingAttachment: report,
        attachmentError: 'That document is still being indexed.',
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('That document is still being indexed.');
    const input = screen.getByRole('textbox', { name: 'Message AirGuard AI' });
    expect(input).toHaveAttribute('placeholder', 'Ask about report.pdf…');

    await user.click(screen.getByRole('button', { name: 'Remove attachment' }));
    expect(spies.setPendingAttachment).toHaveBeenCalledWith(null);
    expect(spies.setAttachmentError).toHaveBeenCalledWith('');

    fireEvent.change(input, { target: { value: 'Will it rain?!' } });
    expect(spies.setInputMessage).toHaveBeenCalledWith('Will it rain?!');

    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(spies.handleSendMessage).toHaveBeenCalledWith('Will it rain?');

    await user.click(screen.getByRole('button', { name: 'report.pdf' }));
    expect(spies.attachFile).toHaveBeenCalledWith(report);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(spies.handleSendMessage).toHaveBeenCalledTimes(2);
    await expectZeroViolations(container);
  });

  it('opens the knowledge panel, lists files and wires upload and deletion', async () => {
    vi.mocked(useAssistant).mockReturnValue(
      assistantState({
        showUploadPanel: true,
        uploadedFiles: [report, processingFile],
        uploadProgress: { 'file-2': 40 },
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    expect(screen.getByRole('heading', { name: 'Knowledge Uploads' })).toBeInTheDocument();
    expect(screen.getByText('Document Base (2)')).toBeInTheDocument();
    expect(screen.getByText('measurements.csv')).toBeInTheDocument();

    const file = new File(['pm25,42'], 'new-data.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Upload environmental report'), { target: { files: [file] } });
    expect(spies.handleFileUpload).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Delete report.pdf' }));
    expect(spies.handleDeleteFile).toHaveBeenCalledWith(report);

    await user.click(screen.getByRole('button', { name: 'Close knowledge uploads' }));
    expect(spies.setShowUploadPanel).toHaveBeenCalledWith(false);
    await expectZeroViolations(container);
  });

  it('toggles the knowledge panel and shows its empty state', async () => {
    vi.mocked(useAssistant).mockReturnValue(assistantState({ showUploadPanel: true, uploadedFiles: [] }));
    const user = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    expect(screen.getByText('No documents yet. Upload a report to analyze with AI.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Knowledge Base (0)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Knowledge Base (0)' }));
    expect(spies.setShowUploadPanel).toHaveBeenCalledWith(false);
    await expectZeroViolations(container);
  });
});
