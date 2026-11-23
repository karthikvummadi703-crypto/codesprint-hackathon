import type { ActiveLocation } from '../../../context/LocationContext';
import {
  getLatestPredictions,
  listAirQualityRecords,
  listCarbonTrips,
} from '../../../services/dataService';
import type { AirQualityRecord, CarbonTripRecord } from '../../../services/dataServiceShared';

export interface ChatContextData {
  aqHistory: AirQualityRecord[];
  carbonTrips: CarbonTripRecord[];
  predictions: unknown[];
  pinnedLocation?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    region?: string;
    country?: string;
  };
}

export async function gatherChatContext(
  uid: string,
  location: ActiveLocation | null,
): Promise<ChatContextData> {
  let aqHistory: AirQualityRecord[] = [];
  let carbonTrips: CarbonTripRecord[] = [];
  let predictions: unknown[] = [];
  let pinnedLocation: ChatContextData['pinnedLocation'] = location
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
      listCarbonTrips(uid),
      getLatestPredictions(uid),
    ]);
    aqHistory = aqRecords;
    carbonTrips = trips;
    predictions = preds;
    if (!pinnedLocation && aqRecords.length > 0 && aqRecords[0]?.location) {
      pinnedLocation = { name: aqRecords[0]!.location };
    }
  } catch {
    // Context loading is best-effort
  }
  return { aqHistory, carbonTrips, predictions, pinnedLocation };
}
