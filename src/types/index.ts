/**
 * Shared domain types for users, locations, air quality, predictions, chat,
 * carbon trips, households, routines, and API records.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  location?: string;
  preferences: {
    units: 'metric' | 'imperial';
    notificationsEnabled: boolean;
    alertThreshold: number;
  };
}

export interface LocationInfo {
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  country?: string;
}

export type AQIStatus =
  'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';

export interface PollutantDetail {
  id: string;
  name: string;
  value: number;
  unit: string;
  status: AQIStatus;
  description: string;
  safeLimit: number;
}

export interface AirQualityData {
  aqi: number;
  status: AQIStatus;
  dominantPollutant: string;
  healthAdvisory: string;
  location: LocationInfo;
  pollutants: PollutantDetail[];
  timestamp: string;
  change24h: number;
}

export interface HistoricalDataPoint {
  time: string;
  aqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
}

export interface PredictionForecast {
  timeOffsetHours: number;
  label: string;
  aqi: number;
  confidence: number;
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
  dominantPollutant: string;
  status: AQIStatus;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: Date;
  createdAt: Date;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  type: 'pdf' | 'csv' | 'txt';
  size: number;
  uploadedAt: Date;
  status: 'processing' | 'ready' | 'error';
  ragFileId?: string;
}

export type TravelMode = 'Car' | 'Bike' | 'Bus' | 'Train' | 'EV' | 'Walking' | 'Bicycle';

export interface CarbonTrip {
  id: string;
  origin: string;
  destination: string;
  distanceKm: number;
  mode: TravelMode;
  co2eKg: number;
  date: Date;
  savings?: number;
}

export type HouseholdMemberKind = 'adult' | 'child' | 'senior' | 'respiratory';

export interface HouseholdMember {
  id: string;
  name: string;
  kind: HouseholdMemberKind;
}

export interface HouseholdProfile {
  members: HouseholdMember[];
  updatedAt?: string;
}

export interface CommunityPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  label?: string;
}

export type RoutineCategory = 'indoor-air' | 'low-emission' | 'outdoor-timing' | 'winter-smog' | 'household';

export interface DailyRoutine {
  id: string;
  title: string;
  category: RoutineCategory;
  detail: string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
}

export type Json = Record<string, unknown>;

export interface StoredRecord extends Json {
  id: string;
}

export interface ConversationRecord extends StoredRecord {
  title: string;
  updatedAt: string;
  createdAt: string;
}

export interface MessageRecord extends StoredRecord {
  role: ChatMessage['role'];
  content: string;
  timestamp: string;
}

export interface AirQualityRecord extends StoredRecord {
  timestamp: string;
  location?: string;
  lat?: number;
  lon?: number;
  aqi?: number;
}

export interface PredictionRecord extends StoredRecord {
  createdAt: string;
  predictions: Json[];
}

export interface CarbonTripRecord extends StoredRecord {
  origin: string;
  destination: string;
  distanceKm: number;
  mode: TravelMode;
  co2eKg: number;
  date: string;
  savings?: number;
}

export interface UploadRecord extends StoredRecord {
  fileId?: string;
  name: string;
  type: KnowledgeFile['type'];
  size?: number | string;
  uploadedAt: string;
  status?: KnowledgeFile['status'];
  ragFileId?: string;
}

export interface ApiLocation {
  name?: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  country?: string;
  source?: string;
}

export interface AqiApiResponse {
  aqi: number;
  status: AQIStatus;
  dominantPollutant: string;
  healthAdvisory: string;
  location?: ApiLocation;
  pollutants: PollutantDetail[];
  timestamp?: string;
  change24h?: number | null;
  historical?: HistoricalDataPoint[];
  source?: string;
  isEstimated?: boolean;
  forecastAvailable?: boolean;
  [key: string]: unknown;
}

export interface PredictionsApiResponse {
  predictions: PredictionForecast[];
  location?: ApiLocation;
  source?: string;
  method?: string;
  horizonHours?: number;
  note?: string;
  timestamp?: string;
  [key: string]: unknown;
}
