/** Public response types shared by backend-service shards. */
export interface PlaceSuggestion {
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  country?: string;
  label?: string;
}

export interface ChatResult {
  response: string;
  contextUsed?: boolean;
  intent?: string;
  contextSections?: string[];
  provider?: string;
  latencyMs?: number;
  degraded?: boolean;
  dataCoverage?: Record<string, boolean>;
}

export interface CurrentWeather {
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitation: number | null;
  cloudCover: number | null;
  pressure: number | null;
  uvIndex: number | null;
  visibility: number | null;
  isDay: boolean;
  condition: string;
  conditionCode: number;
  observedAt: string;
  precipitationProbability: number | null;
}

export interface HourlyWeather {
  timestamp: string;
  localTime: string;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number;
  precipitation: number | null;
  precipitationProbability: number;
  windSpeed: number | null;
  windDirection: number;
  cloudCover: number;
  uvIndex: number | null;
  condition: string;
  conditionCode: number;
}

export interface DailyWeather {
  date: string;
  condition: string;
  conditionCode: number;
  temperatureMax: number | null;
  temperatureMin: number | null;
  precipitationSum: number | null;
  precipitationProbabilityMax: number;
  windSpeedMax: number | null;
  windDirectionDominant: number;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface WeatherResponse {
  location: { name: string; latitude: number; longitude: number; region?: string; country?: string };
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  units: Record<string, string>;
  source: string;
  timezone: string;
  timestamp: string;
}
