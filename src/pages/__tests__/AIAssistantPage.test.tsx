import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AIAssistantPage from '../AIAssistantPage';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import {
  deleteRagFile,
  sendChatMessage,
  uploadDocumentForRag,
} from '../../services/backendService';
import {
  addMessage,
  addUpload,
  createConversation,
  deleteConversation,
  deleteUpload,
  getLatestPredictions,
  getLifestyleSettings,
  listAirQualityRecords,
  listCarbonTrips,
  listConversations,
  listMessages,
  listUploads,
  updateConversation,
} from '../../services/dataService';
import {
  deleteFromStorage,
  isStorageConfigured,
  uploadToStorage,
} from '../../services/storageService';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/LocationContext', () => ({ useLocation: vi.fn() }));
vi.mock('../../services/backendService', () => ({
  sendChatMessage: vi.fn(),
  uploadDocumentForRag: vi.fn(),
  deleteRagFile: vi.fn(),
}));
vi.mock('../../services/dataService', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listMessages: vi.fn(),
  addMessage: vi.fn(),
  listUploads: vi.fn(),
  addUpload: vi.fn(),
  deleteUpload: vi.fn(),
  listAirQualityRecords: vi.fn(),
  listCarbonTrips: vi.fn(),
  getLatestPredictions: vi.fn(),
  getLifestyleSettings: vi.fn(),
}));
vi.mock('../../services/storageService', () => ({
  isStorageConfigured: vi.fn(),
  uploadToStorage: vi.fn(),
  deleteFromStorage: vi.fn(),
}));

const user = { uid: 'user-1' };
const location = {
  name: 'Test City',
  latitude: 12.3,
  longitude: 80.4,
  region: 'Test Region',
  country: 'Test Country',
};
const createdAt = '2026-01-01T00:00:00.000Z';
const updatedAt = '2026-01-02T00:00:00.000Z';

type ConversationList = Awaited<ReturnType<typeof listConversations>>;

async function expectAxeViolationIds(container: HTMLElement, expected: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map((violation) => violation.id)).toEqual(expected);
}

beforeEach(() => {
  if (!document.head.querySelector('style[data-test-tailwind-hidden]')) {
    const style = document.createElement('style');
    style.setAttribute('data-test-tailwind-hidden', '');
    style.textContent = 'input[type="file"] { display: none !important; }';
    document.head.appendChild(style);
  }
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useLocation).mockReturnValue({
    location,
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
  });

  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listUploads).mockResolvedValue([]);
  vi.mocked(getLifestyleSettings).mockResolvedValue(null);
  vi.mocked(createConversation).mockResolvedValue('conv-created');
  vi.mocked(updateConversation).mockResolvedValue(undefined);
  vi.mocked(deleteConversation).mockResolvedValue(undefined);
  vi.mocked(addMessage).mockResolvedValue(undefined);
  vi.mocked(addUpload).mockResolvedValue(undefined);
  vi.mocked(deleteUpload).mockResolvedValue(undefined);
  vi.mocked(listAirQualityRecords).mockResolvedValue([]);
  vi.mocked(listCarbonTrips).mockResolvedValue([]);
  vi.mocked(getLatestPredictions).mockResolvedValue([]);
  vi.mocked(sendChatMessage).mockResolvedValue({ response: 'Mock assistant answer' });
  vi.mocked(uploadDocumentForRag).mockResolvedValue({
    fileId: 'rag-1',
    fileName: 'report.pdf',
    chunkCount: 1,
    textPreview: 'report',
  });
  vi.mocked(deleteRagFile).mockResolvedValue(undefined);
  vi.mocked(isStorageConfigured).mockReturnValue(false);
  vi.mocked(uploadToStorage).mockResolvedValue('https://storage.example/report.pdf');
  vi.mocked(deleteFromStorage).mockResolvedValue(undefined);

  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

describe('AIAssistantPage', () => {
  it('renders a loaded conversation, its messages, and indexed knowledge files', async () => {
    vi.mocked(listConversations).mockResolvedValue([
      { id: 'conv-1', title: 'Existing chat', createdAt, updatedAt },
    ]);
    vi.mocked(listMessages).mockResolvedValue([
      { id: 'msg-1', role: 'user', content: 'What is my AQI?', timestamp: updatedAt },
      { id: 'msg-2', role: 'assistant', content: 'Your AQI is 42.', timestamp: updatedAt },
    ]);
    vi.mocked(listUploads).mockResolvedValue([
      {
        fileId: 'rag-9',
        name: 'report.pdf',
        type: 'pdf',
        size: 2048,
        uploadedAt: createdAt,
        status: 'ready',
      },
    ]);
    vi.mocked(getLifestyleSettings).mockResolvedValue({
      household: { members: [] },
      routines: [],
      routinePromptContext: 'No routines saved',
    });

    const { container } = render(<AIAssistantPage />);

    expect(await screen.findByRole('button', { name: 'Existing chat' })).toBeInTheDocument();
    expect(screen.getByText('What is my AQI?')).toBeInTheDocument();
    expect(screen.getByText('Your AQI is 42.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Knowledge Base (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'report.pdf' })).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });

  it('shows a loading sidebar until conversations resolve and then creates a session for an empty account', async () => {
    let resolveConversations: (value: ConversationList) => void = () => {};
    vi.mocked(listConversations).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConversations = resolve;
        })
    );

    const { container } = render(<AIAssistantPage />);

    expect(screen.getByText('Loading conversations…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await expectAxeViolationIds(container);

    await act(async () => {
      resolveConversations([]);
    });

    expect(await screen.findByRole('button', { name: 'New Conversation' })).toBeInTheDocument();
    expect(createConversation).toHaveBeenCalledWith('user-1', 'New Conversation');
  });

  it('sends a typed message with prior history and renders the backend response', async () => {
    vi.mocked(listConversations).mockResolvedValue([
      { id: 'conv-1', title: 'Existing chat', createdAt, updatedAt },
    ]);
    vi.mocked(listMessages).mockResolvedValue([
      { id: 'msg-1', role: 'assistant', content: 'Prior answer', timestamp: createdAt },
    ]);
    vi.mocked(sendChatMessage).mockResolvedValue({ response: 'Fresh answer' });
    const testUser = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    expect(await screen.findByText('Prior answer')).toBeInTheDocument();
    await testUser.type(
      screen.getByRole('textbox', { name: 'Message AirGuard AI' }),
      'Tell me more{Enter}'
    );

    expect(await screen.findByText('Tell me more')).toBeInTheDocument();
    expect(await screen.findByText('Fresh answer')).toBeInTheDocument();
    expect(sendChatMessage).toHaveBeenCalledWith(
      'Tell me more',
      expect.objectContaining({
        location,
        history: [
          { role: 'assistant', content: 'Prior answer' },
          { role: 'user', content: 'Tell me more' },
        ],
      })
    );
    expect(addMessage).toHaveBeenCalledWith('user-1', 'conv-1', {
      role: 'user',
      content: 'Tell me more',
    });
    await expectAxeViolationIds(container);
  });

  it('shows a session-specific error message when the backend rejects a send', async () => {
    vi.mocked(sendChatMessage).mockRejectedValue(new Error('401 Unauthorized'));
    const testUser = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    await screen.findByRole('button', { name: 'New Conversation' });
    await testUser.type(screen.getByRole('textbox', { name: 'Message AirGuard AI' }), 'Hello');
    await testUser.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText(/⚠️ I couldn't answer that\. 401 Unauthorized/)).toBeInTheDocument();
    expect(screen.getByText(/Your session is no longer valid\. Sign in again and retry\./)).toBeInTheDocument();
    expect(
      within(screen.getByRole('log', { name: 'Chat messages' })).getByText('Hello')
    ).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });

  it('uploads a PDF, stages it for the next message, and passes its rag id to the chat request', async () => {
    const testUser = userEvent.setup();
    const { container } = render(<AIAssistantPage />);
    await screen.findByRole('button', { name: 'New Conversation' });

    await testUser.click(screen.getByRole('button', { name: 'Knowledge Base (0)' }));
    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(fileInputs).toHaveLength(2);
    const report = new File(['report bytes'], 'report.pdf', { type: 'application/pdf' });

    await testUser.upload(fileInputs[1], report);

    expect(await screen.findByRole('button', { name: 'report.pdf' })).toBeInTheDocument();
    expect(uploadDocumentForRag).toHaveBeenCalledWith(report);
    expect(addUpload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'report.pdf', status: 'ready', ragFileId: 'rag-1' })
    );
    expect(isStorageConfigured).toHaveBeenCalled();

    await testUser.click(screen.getByRole('button', { name: 'report.pdf' }));
    expect(screen.getByRole('textbox', { name: 'Message AirGuard AI' })).toHaveAttribute(
      'placeholder',
      'Ask about report.pdf…'
    );
    await testUser.type(screen.getByRole('textbox', { name: 'Message AirGuard AI' }), 'Summarize it');
    await testUser.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Mock assistant answer')).toBeInTheDocument();
    expect(sendChatMessage).toHaveBeenCalledWith(
      'Summarize it',
      expect.objectContaining({ documentIds: ['rag-1'] })
    );
    await expectAxeViolationIds(container);
  });

  it('rejects an unsupported upload type without indexing or adding it', async () => {
    const testUser = userEvent.setup();
    const { container } = render(<AIAssistantPage />);
    await screen.findByRole('button', { name: 'New Conversation' });

    await testUser.click(screen.getByRole('button', { name: 'Knowledge Base (0)' }));
    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInputs[1], {
      target: { files: [new File(['bad'], 'malware.exe')] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported file type: malware.exe. Upload PDF, CSV, or TXT.'
    );
    expect(uploadDocumentForRag).not.toHaveBeenCalled();
    expect(addUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Knowledge Base (0)' })).toBeInTheDocument();
    await expectAxeViolationIds(container);
  });

  it('deletes conversations and knowledge files from the sidebar', async () => {
    vi.mocked(listConversations).mockResolvedValue([
      { id: 'conv-1', title: 'Existing chat', createdAt, updatedAt },
    ]);
    vi.mocked(listUploads).mockResolvedValue([
      {
        fileId: 'file-1',
        name: 'old.pdf',
        type: 'pdf',
        size: 1024,
        uploadedAt: createdAt,
        status: 'ready',
        ragFileId: 'rag-1',
      },
    ]);
    const testUser = userEvent.setup();
    const { container } = render(<AIAssistantPage />);

    expect(await screen.findByRole('button', { name: 'Existing chat' })).toBeInTheDocument();
    await testUser.click(screen.getByRole('button', { name: 'Delete conversation Existing chat' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Existing chat' })).not.toBeInTheDocument()
    );
    expect(deleteConversation).toHaveBeenCalledWith('user-1', 'conv-1');

    await testUser.click(screen.getByRole('button', { name: 'Knowledge Base (1)' }));
    await testUser.click(screen.getByRole('button', { name: 'Delete old.pdf' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Knowledge Base (0)' })).toBeInTheDocument()
    );
    expect(deleteRagFile).toHaveBeenCalledWith('rag-1');
    expect(deleteFromStorage).toHaveBeenCalledWith('users/user-1/uploads/old.pdf');
    expect(deleteUpload).toHaveBeenCalledWith('user-1', 'file-1');
    await expectAxeViolationIds(container);
  });
});
