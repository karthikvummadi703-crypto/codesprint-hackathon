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
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous';

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
