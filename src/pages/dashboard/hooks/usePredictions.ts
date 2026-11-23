import { useEffect, useMemo, useState } from 'react';
import {
  fetchPredictions,
  fetchWeather,
  type WeatherResponse,
} from '../../../services/backendService';
import { useAuth } from '../../../context/AuthContext';
import { useLocation, toLocationParams } from '../../../context/LocationContext';
import { listAirQualityRecords, savePredictions } from '../../../services/dataService';
import type { PredictionForecast } from '../../../types';
import { activityGuidance, type ActivityGuidance } from '../utils/predictions';

// Prediction response is handled as dynamic backend payload at runtime.
type ResolvedParams = { lat?: number; lon?: number; city?: string };

async function resolveStoredCoords(
  user: ReturnType<typeof useAuth>['user'],
  params: ResolvedParams,
): Promise<ResolvedParams> {
  let lat = params.lat;
  let lon = params.lon;
  const city = params.city;
  if (user && lat === undefined) {
    try {
      const records = await listAirQualityRecords(user.uid, 1);
      const last = records[0];
      if (last?.lat && last?.lon) {
        lat = Number(last.lat);
        lon = Number(last.lon);
      }
    } catch {
      return { lat, lon, city };
    }
  }
  return { lat, lon, city };
}

export interface PredictionController {
  forecasts: PredictionForecast[];
  weather: WeatherResponse | null;
  loading: boolean;
  weatherError: string;
  error: string;
  method: string;
  provenanceNote: string;
  locationLabel: string;
  load: (force?: boolean) => Promise<void>;
  firstForecast: PredictionForecast | null;
  latestForecast: PredictionForecast | null;
  aqiDiff: number;
  peak: number;
  worst: PredictionForecast | null;
  avgConfidence: number;
  guidance: ActivityGuidance;
  current: WeatherResponse['current'] | undefined;
  tempUnit: string;
  windUnit: string;
  hourly: WeatherResponse['hourly'];
}

/** Loads forecast and weather data for the active location and derives summary guidance. */
export function usePredictions(): PredictionController {
  const { user } = useAuth();
  const { location } = useLocation();
  const [forecasts, setForecasts] = useState<PredictionForecast[]>([]);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [error, setError] = useState('');
  const [method, setMethod] = useState('');
  const [provenanceNote, setProvenanceNote] = useState('');
  const [locationLabel, setLocationLabel] = useState(location?.name ?? '');

  const load = async (force = false) => {
    if (!location) return;
    setLoading(true);
    setError('');
    const params = toLocationParams(location);
    setLocationLabel(location.name);
    const resolved = await resolveStoredCoords(user, params);

    setWeatherError('');
    const weatherPromise =
      resolved.lat !== undefined || resolved.city
        ? fetchWeather({ ...resolved, hours: 24, days: 3, force }).catch(e => {
            setWeatherError(e instanceof Error ? e.message : String(e));
            return null;
          })
        : Promise.resolve(null);

    try {
      const [data, weatherData] = await Promise.all([
        fetchPredictions({ ...resolved, days: 5, force }),
        weatherPromise,
      ]);
      const list = Array.isArray(data.predictions) ? data.predictions : [];
      setForecasts(list);
      setWeather(weatherData);
      setMethod(typeof data.method === 'string' ? data.method : '');
      setProvenanceNote(typeof data.note === 'string' ? data.note : '');
      if (user && list.length > 0) savePredictions(user.uid, list).catch(() => {});
    } catch (e) {
      setForecasts([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial prediction load must stay in the effect to preserve mount timing.
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location?.name, location?.latitude, location?.longitude]);

  const firstForecast = forecasts[0] ?? null;
  const latestForecast = forecasts[forecasts.length - 1] ?? null;
  const aqiDiff = firstForecast && latestForecast ? latestForecast.aqi - firstForecast.aqi : 0;
  const peak = forecasts.reduce((max, f) => (f.aqi > max ? f.aqi : max), 0);
  const worst = forecasts.reduce<PredictionForecast | null>(
    (acc, f) => (!acc || f.aqi > acc.aqi ? f : acc),
    null,
  );
  const avgConfidence = useMemo(() => {
    const forward = forecasts.filter(f => f.timeOffsetHours > 0);
    if (forward.length === 0) return 0;
    return Math.round(forward.reduce((acc, f) => acc + (f.confidence || 0), 0) / forward.length);
  }, [forecasts]);

  const current = weather?.current;
  const units = weather?.units;
  const tempUnit = units?.temperature ?? '°C';
  const windUnit = units?.windSpeed ?? 'km/h';
  const hourly = weather?.hourly ?? [];

  return {
    forecasts,
    weather,
    loading,
    weatherError,
    error,
    method,
    provenanceNote,
    locationLabel,
    load,
    firstForecast,
    latestForecast,
    aqiDiff,
    peak,
    worst,
    avgConfidence,
    guidance: activityGuidance(peak),
    current,
    tempUnit,
    windUnit,
    hourly,
  };
}
