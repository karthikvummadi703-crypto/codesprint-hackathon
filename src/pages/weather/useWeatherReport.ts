/**
 * Weather page hook for abortable, location-aware weather loading and refresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation, toLocationParams } from '../../context/LocationContext';
import { fetchWeather, WeatherResponse } from '../../services/backendService';

export function useWeatherReport() {
  const { location } = useLocation();
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (force = false) => {
      if (!location) return;
      setLoading(true);
      setError('');
      try {
        const params = toLocationParams(location);
        const data = await fetchWeather({ ...params, hours: 24, days: 7, force });
        setWeather(data);
      } catch (e) {
        setWeather(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [location],
  );

  useEffect(() => {
    load();
  }, [load]);

  const locName = weather?.location?.name || location?.name;
  const current = weather?.current;
  const hourly = weather?.hourly;
  const daily = weather?.daily;
  const units = weather?.units;
  const source = weather?.source;
  const timestamp = weather?.timestamp;
  const tempUnit = units?.temperature ?? '\u00b0C';
  const windUnit = units?.windSpeed ?? 'km/h';

  return {
    location,
    weather,
    loading,
    error,
    load,
    locName,
    current,
    hourly,
    daily,
    source,
    timestamp,
    tempUnit,
    windUnit,
  };
}
