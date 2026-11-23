import { useCallback, useEffect, useState } from 'react';
import { fetchWeather, type WeatherResponse } from '../../../services/backendService';
import { useLocation, toLocationParams } from '../../../context/LocationContext';
import type { ActiveLocation } from '../../../context/LocationContext';

export interface WeatherReportController {
  weather: WeatherResponse | null;
  loading: boolean;
  error: string;
  location: ActiveLocation | null;
  load: (force?: boolean) => Promise<void>;
}

/** Loads and refreshes the weather report for the active location. */
export function useWeatherReport(): WeatherReportController {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial weather load must stay in the effect to preserve mount timing.
    load();
  }, [load]);

  return { weather, loading, error, location, load };
}
