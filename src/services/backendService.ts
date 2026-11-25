/**
 * Typed client facade for AQI, predictions, weather, geocoding, chat, RAG
 * uploads, and carbon endpoints.
 */
export { fetchAQI, fetchPredictions } from './backendService/air';
export { calculateCarbon, estimateDistance } from './backendService/carbon';
export { deleteRagFile, sendChatMessage, uploadDocumentForRag } from './backendService/chat';
export { reverseGeocode, searchLocations } from './backendService/geo';
export { PREDICTION_METHOD, backendHealth } from './backendService/shared';
export type {
  ChatResult,
  CurrentWeather,
  DailyWeather,
  HourlyWeather,
  PlaceSuggestion,
  WeatherResponse,
} from './backendService/types';
export { fetchWeather, fetchWeatherSummary } from './backendService/weather';
