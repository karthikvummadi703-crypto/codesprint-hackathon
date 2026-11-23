import type {
  AirQualityData,
  AQIStatus,
  HistoricalDataPoint,
  PollutantDetail,
} from '../../../types';

export interface BackendReading {
  aqi: number;
  status: AQIStatus;
  dominantPollutant: string;
  healthAdvisory: string;
  location?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    region?: string;
    country?: string;
  };
  pollutants: PollutantDetail[];
  timestamp: string;
  change24h: number;
  historical?: HistoricalDataPoint[];
  isEstimated?: boolean;
  [key: string]: unknown;
}
export type ReadingParams = { lat?: number; lon?: number; city?: string };

export function toAirQuality(
  data: Record<string, unknown>,
  locationLabel: string,
  params: ReadingParams,
): AirQualityData {
  const reading = data as BackendReading;
  return {
    aqi: Number(reading.aqi),
    status: reading.status,
    dominantPollutant: reading.dominantPollutant,
    healthAdvisory: reading.healthAdvisory,
    location: {
      name: reading.location?.name || locationLabel,
      latitude: Number(reading.location?.latitude ?? params.lat ?? 0),
      longitude: Number(reading.location?.longitude ?? params.lon ?? 0),
      region: reading.location?.region,
      country: reading.location?.country,
    },
    pollutants: Array.isArray(reading.pollutants) ? reading.pollutants : [],
    timestamp: reading.timestamp || new Date().toISOString(),
    change24h: Number(reading.change24h ?? 0),
  };
}

export function toAirQualityRecord(aq: AirQualityData) {
  return {
    aqi: aq.aqi,
    status: aq.status,
    dominantPollutant: aq.dominantPollutant,
    location: aq.location.name,
    lat: aq.location.latitude,
    lon: aq.location.longitude,
    timestamp: aq.timestamp,
  };
}

export function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return 'Location permission denied. Enable location access or search manually.';
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'Location unavailable. Please search for a city instead.';
  }
  return 'Unable to fetch your location. Please try again.';
}
