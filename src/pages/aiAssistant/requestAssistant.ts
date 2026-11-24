import { sendChatMessage } from '../../services/backendService';
import { listAirQualityRecords, listCarbonTrips, getLatestPredictions } from '../../services/dataService';
import { AssistantReplyParams } from './types';
import type { AirQualityRecord, CarbonTripRecord, Json } from '../../types';

export async function requestAssistantReply({
  uid,
  text,
  attachment,
  history,
  location,
  lifestyle,
}: AssistantReplyParams): Promise<string> {
  // Gather user context for richer AI responses
  let aqHistory: AirQualityRecord[] = [];
  let carbonTrips: CarbonTripRecord[] = [];
  let predictions: Json[] = [];
  let pinnedLocation:
    | {
        name?: string;
        latitude?: number;
        longitude?: number;
        region?: string;
        country?: string;
      }
    | undefined = location
    ? {
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        region: location.region,
        country: location.country,
      }
    : undefined;
  try {
    const [aqRecords, trips, preds] = await Promise.all([
      listAirQualityRecords(uid, 5),
      listCarbonTrips(uid, 200),
      getLatestPredictions(uid),
    ]);
    aqHistory = aqRecords;
    carbonTrips = trips;
    predictions = preds;
    // Only fall back to a stored record when nothing is pinned, so the
    // assistant never answers about a stale location by default.
    if (!pinnedLocation && aqRecords.length > 0 && aqRecords[0].location) {
      pinnedLocation = { name: aqRecords[0].location };
    }
  } catch {
    // Context loading is best-effort
  }

  const { response } = await sendChatMessage(text, {
    location: pinnedLocation,
    aqHistory,
    carbonTrips,
    predictions,
    // Only the file chosen for this turn is passed. The backend resolves
    // the id inside the caller's own knowledge base, so an id belonging to
    // someone else retrieves nothing.
    documentIds: attachment?.ragFileId ? [attachment.ragFileId] : undefined,
    history,
    household: lifestyle?.household,
    routines: lifestyle?.routines,
    routineContext: lifestyle?.routineContext,
  });
  return response;
}
