/** Compatibility surface for backend API requests, re-exported from focused modules. */
export { PREDICTION_METHOD, fetchAQI, fetchPredictions } from './backendServiceAir';

export { searchLocations, reverseGeocode } from './backendServicePlaces';
export type { PlaceSuggestion } from './backendServicePlaces';

export { sendChatMessage } from './backendServiceChat';
export type { ChatResult } from './backendServiceChat';

export { uploadDocumentForRag, deleteRagFile } from './backendServiceRag';

export { calculateCarbon, estimateDistance } from './backendServiceCarbon';

export { fetchWeather, fetchWeatherSummary } from './backendServiceWeather';
export type {
  CurrentWeather,
  HourlyWeather,
  DailyWeather,
  WeatherResponse,
} from './backendServiceWeather';

export { backendHealth } from './backendServiceClient';
