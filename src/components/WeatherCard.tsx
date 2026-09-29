import { useEffect, useState } from 'react';
import { Cloud, Droplets, Sun, Wind, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { fetchWeather, WeatherResponse } from '../services/backendService';

/**
 * Live current conditions for the pinned location.
 *
 * Renders an explicit unavailable state rather than placeholder numbers: a
 * weather card showing 0°C when the provider is down would read as a real
 * measurement, which is exactly what this whole project is meant to avoid.
 */
export default function WeatherCard({
  params,
}: {
  params: { lat?: number; lon?: number; city?: string };
}) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const lat = params.lat;
  const lon = params.lon;
  const city = params.city;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchWeather({ lat, lon, city, hours: 8, days: 5 })
      .then((data) => {
        if (cancelled) return;
        setWeather(data);
        setError('');
      })
      .catch((e) => {
        if (cancelled) return;
        setWeather(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Re-fetch only when the pinned location actually changes.
  }, [lat, lon, city]);

  if (loading && !weather) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current Weather</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading conditions
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-sm">Current Weather</CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Weather is unavailable right now. Air quality readings below are unaffected.</span>
        </CardContent>
      </Card>
    );
  }

  const { current, daily, units } = weather;
  const tempUnit = units?.temperature ?? '°C';
  const windUnit = units?.windSpeed ?? 'km/h';
  const today = daily?.[0];
  const tomorrow = daily?.[1];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Current Weather</CardTitle>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">{weather.source}</span>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-slate-900">
                {current.temperature !== null ? Math.round(current.temperature) : '--'}
              </span>
              <span className="text-sm text-slate-500">{tempUnit}</span>
            </div>
            <p className="text-sm text-slate-600 mt-0.5">{current.condition}</p>
            {current.feelsLike !== null && (
              <p className="text-xs text-slate-400 mt-0.5">Feels like {Math.round(current.feelsLike)}{tempUnit}</p>
            )}
          </div>
          <Cloud className="h-10 w-10 text-slate-300 shrink-0" />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
          <Metric
            icon={<Droplets className="h-3.5 w-3.5" />}
            label="Humidity"
            value={current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
          />
          <Metric
            icon={<Wind className="h-3.5 w-3.5" />}
            label="Wind"
            value={current.windSpeed !== null ? `${Math.round(current.windSpeed)} ${windUnit}` : '--'}
          />
          <Metric
            icon={<Sun className="h-3.5 w-3.5" />}
            label="UV index"
            value={current.uvIndex !== null ? String(Math.round(current.uvIndex)) : '--'}
          />
        </div>

        {current.precipitationProbability !== null && current.precipitationProbability > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            {Math.round(current.precipitationProbability)}% chance of precipitation in the next hour.
          </p>
        )}

        {(today || tomorrow) && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100 text-xs">
            {today && (
              <div className="flex-1">
                <p className="text-slate-400 font-medium">Today</p>
                <p className="text-slate-700">{today.condition}</p>
                <p className="text-slate-500">
                  {today.temperatureMin !== null ? Math.round(today.temperatureMin) : '--'}–
                  {today.temperatureMax !== null ? Math.round(today.temperatureMax) : '--'}
                  {tempUnit} · rain {Math.round(today.precipitationProbabilityMax)}%
                </p>
              </div>
            )}
            {tomorrow && (
              <div className="flex-1">
                <p className="text-slate-400 font-medium">Tomorrow</p>
                <p className="text-slate-700">{tomorrow.condition}</p>
                <p className="text-slate-500">
                  {tomorrow.temperatureMin !== null ? Math.round(tomorrow.temperatureMin) : '--'}–
                  {tomorrow.temperatureMax !== null ? Math.round(tomorrow.temperatureMax) : '--'}
                  {tempUnit} · rain {Math.round(tomorrow.precipitationProbabilityMax)}%
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}
