/**
 * Predictions page hook for location-aware forecast loading, persistence,
 * derived charts, and error state.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, toLocationParams } from '../../context/LocationContext';
import { fetchPredictions, fetchWeather, WeatherResponse } from '../../services/backendService';
import { listAirQualityRecords, savePredictions } from '../../services/dataService';
import { Json, PredictionForecast } from '../../types';
import { activityGuidance } from './helpers';

export function usePredictions() {
  const { user } = useAuth();
  const { location } = useLocation();
  // No seeded mock data: a stale chart that looks live is worse than an empty
  // state. An empty list renders the unavailable message instead.
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
    let lat: number | undefined = params.lat;
    let lon: number | undefined = params.lon;
    const city: string | undefined = params.city;

    // Fall back to the last stored reading only when nothing is pinned yet.
    if (user && lat === undefined) {
      try {
        const records = await listAirQualityRecords(user.uid, 1);
        const last = records[0];
        if (last?.lat && last?.lon) {
          lat = Number(last.lat);
          lon = Number(last.lon);
        }
      } catch {
        // ignore
      }
    }

    // Weather is fetched alongside the forecast: the meteorological drivers are
    // what explain the pollution curve, and a prediction page that omits them
    // cannot answer "why".
    setWeatherError('');
    const weatherPromise =
      lat !== undefined || city
        ? fetchWeather({ lat, lon, city, hours: 24, days: 3, force }).catch((e) => {
            setWeatherError(e instanceof Error ? e.message : String(e));
            return null;
          })
        : Promise.resolve(null);

    try {
      const [data, weatherData] = await Promise.all([
        fetchPredictions({ lat, lon, city, days: 5, force }),
        weatherPromise,
      ]);
      const list = Array.isArray(data.predictions) ? data.predictions : [];
      setForecasts(list);
      setWeather(weatherData);
      setMethod(typeof data.method === 'string' ? data.method : '');
      setProvenanceNote(typeof data.note === 'string' ? data.note : '');
      if (user && list.length > 0) savePredictions(user.uid, list as unknown as Json[]).catch(() => {});
    } catch (e) {
      // Clear the chart rather than leaving an unrelated location's forecast up.
      setForecasts([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location?.name, location?.latitude, location?.longitude]);

  // Every derived value is guarded on `forecasts.length`. The list starts empty
  // and stays empty until a fetch succeeds, so indexing into it unguarded was
  // what made this page fail to render at all.
  const firstForecast = forecasts[0] ?? null;
  const latestForecast = forecasts[forecasts.length - 1] ?? null;
  const aqiDiff = firstForecast && latestForecast ? latestForecast.aqi - firstForecast.aqi : 0;
  const peak = forecasts.reduce((max, f) => (f.aqi > max ? f.aqi : max), 0);
  const worst = forecasts.reduce<PredictionForecast | null>(
    (acc, f) => (!acc || f.aqi > acc.aqi ? f : acc),
    null,
  );
  const avgConfidence = useMemo(() => {
    const forward = forecasts.filter((f) => f.timeOffsetHours > 0);
    if (forward.length === 0) return 0;
    return Math.round(forward.reduce((acc, f) => acc + (f.confidence || 0), 0) / forward.length);
  }, [forecasts]);

  const guidance = activityGuidance(peak);
  const current = weather?.current;
  const units = weather?.units;
  const tempUnit = units?.temperature ?? '°C';
  const windUnit = units?.windSpeed ?? 'km/h';
  const hourly = weather?.hourly ?? [];

  return {
    location,
    forecasts,
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
    guidance,
    current,
    tempUnit,
    windUnit,
    hourly,
    weather,
  };
}
