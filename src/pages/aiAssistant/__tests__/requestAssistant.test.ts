import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveLocation } from '../../../context/LocationContext';
import type { AirQualityRecord, CarbonTripRecord, Json, KnowledgeFile } from '../../../types';
import { requestAssistantReply } from '../requestAssistant';
import type { AssistantReplyParams, LifestyleContext } from '../types';

const mocks = vi.hoisted(() => ({
  sendChatMessage:
    vi.fn<(message: string, context?: Record<string, unknown>) => Promise<{ response: string }>>(),
  listAirQualityRecords: vi.fn<(uid: string, max: number) => Promise<AirQualityRecord[]>>(),
  listCarbonTrips: vi.fn<(uid: string, max?: number) => Promise<CarbonTripRecord[]>>(),
  getLatestPredictions: vi.fn<(uid: string) => Promise<Json[]>>(),
}));

vi.mock('../../../services/backendService', () => ({
  sendChatMessage: mocks.sendChatMessage,
}));

vi.mock('../../../services/dataService', () => ({
  listAirQualityRecords: mocks.listAirQualityRecords,
  listCarbonTrips: mocks.listCarbonTrips,
  getLatestPredictions: mocks.getLatestPredictions,
}));

const pinned: ActiveLocation = {
  name: 'Delhi',
  latitude: 28.6,
  longitude: 77.2,
  region: 'DL',
  country: 'IN',
};

function makeParams(overrides: Partial<AssistantReplyParams> = {}): AssistantReplyParams {
  return {
    uid: 'user-1',
    text: 'Why is AQI high?',
    attachment: null,
    history: [{ role: 'user', content: 'Earlier question' }],
    location: pinned,
    lifestyle: null,
    ...overrides,
  };
}

function makeAqRecord(overrides: Partial<AirQualityRecord> = {}): AirQualityRecord {
  return { id: 'aq-1', timestamp: '2026-01-01T00:00:00Z', ...overrides };
}

function makeTrip(overrides: Partial<CarbonTripRecord> = {}): CarbonTripRecord {
  return {
    id: 'trip-1',
    origin: 'Home',
    destination: 'Office',
    distanceKm: 12,
    mode: 'Car',
    co2eKg: 2.4,
    date: '2026-01-02T08:00:00Z',
    ...overrides,
  };
}

function makeFile(ragFileId?: string): KnowledgeFile {
  return {
    id: 'file-1',
    name: 'report.pdf',
    type: 'pdf',
    size: 128,
    uploadedAt: new Date('2026-01-01T00:00:00Z'),
    status: 'ready',
    ragFileId,
  };
}

describe('requestAssistantReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendChatMessage.mockResolvedValue({ response: 'Because of traffic.' });
    mocks.listAirQualityRecords.mockResolvedValue([]);
    mocks.listCarbonTrips.mockResolvedValue([]);
    mocks.getLatestPredictions.mockResolvedValue([]);
  });

  it('forwards pinned location, stored context, attachment and lifestyle to the backend', async () => {
    const aqHistory = [makeAqRecord({ aqi: 120 })];
    const carbonTrips = [makeTrip()];
    const predictions: Json[] = [{ aqi: 130, label: 'tomorrow' }];
    const history = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
    ];
    const lifestyle: LifestyleContext = {
      household: { members: 2 },
      routines: [{ title: 'Run a purifier' }],
      routineContext: 'household context',
    };
    mocks.listAirQualityRecords.mockResolvedValue(aqHistory);
    mocks.listCarbonTrips.mockResolvedValue(carbonTrips);
    mocks.getLatestPredictions.mockResolvedValue(predictions);

    const reply = await requestAssistantReply(
      makeParams({ attachment: makeFile('rag-7'), history, lifestyle }),
    );

    expect(reply).toBe('Because of traffic.');
    expect(mocks.listAirQualityRecords).toHaveBeenCalledWith('user-1', 5);
    expect(mocks.listCarbonTrips).toHaveBeenCalledWith('user-1', 200);
    expect(mocks.getLatestPredictions).toHaveBeenCalledWith('user-1');
    expect(mocks.sendChatMessage).toHaveBeenCalledTimes(1);
    const [text, context] = mocks.sendChatMessage.mock.calls[0]!;
    expect(text).toBe('Why is AQI high?');
    expect(context).toMatchObject({
      location: { name: 'Delhi', latitude: 28.6, longitude: 77.2, region: 'DL', country: 'IN' },
      aqHistory,
      carbonTrips,
      predictions,
      documentIds: ['rag-7'],
      history,
      household: { members: 2 },
      routines: [{ title: 'Run a purifier' }],
      routineContext: 'household context',
    });
  });

  it('falls back to the latest stored record location when nothing is pinned', async () => {
    mocks.listAirQualityRecords.mockResolvedValue([makeAqRecord({ location: 'Past City' })]);

    await requestAssistantReply(makeParams({ location: null }));

    const [, context] = mocks.sendChatMessage.mock.calls[0]!;
    expect(context?.location).toEqual({ name: 'Past City' });
  });

  it('keeps the pinned location when a stale stored record exists', async () => {
    mocks.listAirQualityRecords.mockResolvedValue([makeAqRecord({ location: 'Past City' })]);

    await requestAssistantReply(makeParams());

    const [, context] = mocks.sendChatMessage.mock.calls[0]!;
    expect(context?.location).toEqual({
      name: 'Delhi',
      latitude: 28.6,
      longitude: 77.2,
      region: 'DL',
      country: 'IN',
    });
  });

  it('still sends the question when context loading fails', async () => {
    mocks.listAirQualityRecords.mockRejectedValue(new Error('firestore unavailable'));

    const reply = await requestAssistantReply(makeParams({ location: null }));

    expect(reply).toBe('Because of traffic.');
    const [, context] = mocks.sendChatMessage.mock.calls[0]!;
    expect(context?.location).toBeUndefined();
    expect(context?.aqHistory).toEqual([]);
    expect(context?.carbonTrips).toEqual([]);
    expect(context?.predictions).toEqual([]);
    expect(context?.documentIds).toBeUndefined();
  });

  it('omits document ids and lifestyle fields when none are supplied', async () => {
    await requestAssistantReply(makeParams({ attachment: makeFile(), lifestyle: null }));

    const [, context] = mocks.sendChatMessage.mock.calls[0]!;
    expect(context?.documentIds).toBeUndefined();
    expect(context?.household).toBeUndefined();
    expect(context?.routines).toBeUndefined();
    expect(context?.routineContext).toBeUndefined();
  });

  it('propagates a backend rejection to the caller', async () => {
    mocks.sendChatMessage.mockRejectedValue(new Error('service down'));

    await expect(requestAssistantReply(makeParams())).rejects.toThrow('service down');
  });
});
