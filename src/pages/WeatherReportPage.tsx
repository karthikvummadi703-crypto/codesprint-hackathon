import React, { useEffect, useState, useCallback } from 'react';
import {
  Cloud,
  Droplets,
  Sun,
  Wind,
  Thermometer,
  Eye,
  Gauge,
  RefreshCw,
  AlertCircle,
  MapPin,
  ArrowUp,
  ArrowDown,
  Umbrella,
  Navigation,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchWeather, WeatherResponse, DailyWeather, HourlyWeather } from '../services/backendService';
import { useLocation, toLocationParams } from '../context/LocationContext';
import LocationPicker from '../components/LocationPicker';

/* ── helpers ─────────────────────────────────────────────────────────── */

function windDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function uvColor(uv: number): string {
  if (uv <= 2) return 'bg-emerald-100 text-emerald-800';
  if (uv <= 5) return 'bg-yellow-100 text-yellow-800';
  if (uv <= 7) return 'bg-orange-100 text-orange-800';
  if (uv <= 10) return 'bg-red-100 text-red-800';
  return 'bg-purple-100 text-purple-800';
}

function dayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function hourLabel(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts.slice(11, 16);
  }
}

/* ── weather condition icon ──────────────────────────────────────────── */
function ConditionIcon({ code, size = 'h-6 w-6' }: { code: number; size?: string }) {
  if (code === 0) return <Sun className={`${size} text-yellow-400`} />;
  if (code <= 2) return <Cloud className={`${size} text-slate-300`} />;
  if (code <= 49) return <Cloud className={`${size} text-slate-400`} />;
  if (code <= 67) return <Droplets className={`${size} text-blue-400`} />;
  if (code <= 82) return <Droplets className={`${size} text-blue-600`} />;
  return <Cloud className={`${size} text-slate-600`} />;
}

/* ── Stat tile ───────────────────────────────────────────────────────── */
function StatTile({
  icon,
  label,
  value,
  sub,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
      {extra}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */
export default function WeatherReportPage() {
  const { location } = useLocation();
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    setError('');
    try {
      const params = toLocationParams(location);
      const data = await fetchWeather({ ...params, hours: 24, days: 7 });
      setWeather(data);
    } catch (e) {
      setWeather(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    load();
  }, [load]);

  if (!location) return <LocationPicker compact />;

  const locName = weather?.location?.name || location.name;
  const current = weather?.current;
  const hourly = weather?.hourly;
  const daily = weather?.daily;
  const units = weather?.units;
  const source = weather?.source;
  const timestamp = weather?.timestamp;
  const tempUnit = units?.temperature ?? '\u00b0C';
  const windUnit = units?.windSpeed ?? 'km/h';

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Weather Report</h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
              <MapPin className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-semibold text-slate-700">{locName}</span>
              {source && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                  via {source}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {timestamp && (
              <span className="text-[11px] text-slate-400 hidden sm:block">
                Updated{' '}
                {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={load} loading={loading} className="h-9">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {/* error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Weather data unavailable</p>
              <p className="text-xs mt-1">{error}</p>
              <p className="text-xs mt-0.5 text-red-400">
                Ensure the backend is running: uvicorn main:app --reload --port 8001
              </p>
            </div>
          </div>
        )}

        {/* loading */}
        {loading && !weather && (
          <Card>
            <CardContent className="py-12 flex items-center justify-center gap-2 text-slate-400 text-sm">
              <RefreshCw className="h-5 w-5 animate-spin" /> Fetching weather data…
            </CardContent>
          </Card>
        )}

        {weather && current && (
          <>
            {/* Current conditions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Hero */}
              <Card className="lg:col-span-1 bg-gradient-to-br from-brand-600 to-brand-800 text-white border-0 shadow-lg overflow-visible">
                <CardContent className="py-8">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-brand-200 text-sm font-medium">Current Conditions</p>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-6xl font-extrabold">
                          {current.temperature !== null ? Math.round(current.temperature) : '--'}
                        </span>
                        <span className="text-2xl text-brand-200">{tempUnit}</span>
                      </div>
                      <p className="text-brand-100 mt-1 text-lg font-medium">{current.condition}</p>
                      {current.feelsLike !== null && (
                        <p className="text-brand-300 text-sm mt-1">
                          Feels like {Math.round(current.feelsLike)}{tempUnit}
                        </p>
                      )}
                    </div>
                    <ConditionIcon code={current.conditionCode} size="h-14 w-14" />
                  </div>
                  <div className="mt-6 pt-5 border-t border-white/20 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-brand-300 text-xs uppercase tracking-wide">Humidity</p>
                      <p className="font-bold mt-0.5">
                        {current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-brand-300 text-xs uppercase tracking-wide">Rain chance</p>
                      <p className="font-bold mt-0.5">
                        {current.precipitationProbability !== null
                          ? `${Math.round(current.precipitationProbability)}%`
                          : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-brand-300 text-xs uppercase tracking-wide">Wind</p>
                      <p className="font-bold mt-0.5">
                        {current.windSpeed !== null ? `${Math.round(current.windSpeed)} ${windUnit}` : '--'}
                        {current.windDirection !== null ? ` ${windDeg(current.windDirection)}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-brand-300 text-xs uppercase tracking-wide">UV Index</p>
                      <p className="font-bold mt-0.5">
                        {current.uvIndex !== null
                          ? `${Math.round(current.uvIndex)} \u2014 ${uvLabel(Math.round(current.uvIndex))}`
                          : '--'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed metrics */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Detailed Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    <StatTile
                      icon={<Thermometer className="h-3.5 w-3.5" />}
                      label="Feels Like"
                      value={
                        current.feelsLike !== null ? `${Math.round(current.feelsLike)}${tempUnit}` : '--'
                      }
                    />
                    <StatTile
                      icon={<Droplets className="h-3.5 w-3.5" />}
                      label="Humidity"
                      value={current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
                    />
                    <StatTile
                      icon={<Wind className="h-3.5 w-3.5" />}
                      label="Wind Speed"
                      value={
                        current.windSpeed !== null ? `${Math.round(current.windSpeed)} ${windUnit}` : '--'
                      }
                      sub={
                        current.windDirection !== null ? `Direction: ${windDeg(current.windDirection)}` : undefined
                      }
                    />
                    <StatTile
                      icon={<Umbrella className="h-3.5 w-3.5" />}
                      label="Rain Chance"
                      value={
                        current.precipitationProbability !== null
                          ? `${Math.round(current.precipitationProbability)}%`
                          : '--'
                      }
                      sub={
                        current.precipitation !== null
                          ? `Precipitation: ${current.precipitation} mm`
                          : undefined
                      }
                    />
                    <StatTile
                      icon={<Sun className="h-3.5 w-3.5" />}
                      label="UV Index"
                      value={current.uvIndex !== null ? String(Math.round(current.uvIndex)) : '--'}
                      extra={
                        current.uvIndex !== null ? (
                          <span
                            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${uvColor(
                              Math.round(current.uvIndex)
                            )}`}
                          >
                            {uvLabel(Math.round(current.uvIndex))}
                          </span>
                        ) : undefined
                      }
                    />
                    <StatTile
                      icon={<Gauge className="h-3.5 w-3.5" />}
                      label="Pressure"
                      value={current.pressure !== null ? `${Math.round(current.pressure)} hPa` : '--'}
                    />
                    <StatTile
                      icon={<Eye className="h-3.5 w-3.5" />}
                      label="Visibility"
                      value={current.visibility !== null ? `${Math.round(current.visibility)} km` : '--'}
                    />
                    <StatTile
                      icon={<Cloud className="h-3.5 w-3.5" />}
                      label="Cloud Cover"
                      value={current.cloudCover !== null ? `${Math.round(current.cloudCover)}%` : '--'}
                    />
                    <StatTile
                      icon={<Navigation className="h-3.5 w-3.5" />}
                      label="Wind Direction"
                      value={current.windDirection !== null ? `${Math.round(current.windDirection)}\u00b0` : '--'}
                      sub={current.windDirection !== null ? windDeg(current.windDirection) : undefined}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Hourly Forecast */}
            {hourly && hourly.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>24-Hour Forecast</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <div className="flex gap-3 p-5 min-w-max">
                      {hourly.slice(0, 24).map((h: HourlyWeather) => (
                        <div
                          key={h.timestamp}
                          className="flex flex-col items-center gap-2 min-w-[72px] px-3 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-300 transition-colors"
                        >
                          <p className="text-[11px] font-semibold text-slate-500">{hourLabel(h.timestamp)}</p>
                          <ConditionIcon code={h.conditionCode} size="h-5 w-5" />
                          <p className="text-base font-bold text-slate-900">
                            {h.temperature !== null ? `${Math.round(h.temperature)}${tempUnit}` : '--'}
                          </p>
                          {h.precipitationProbability > 0 && (
                            <div className="flex items-center gap-0.5 text-[10px] text-blue-600">
                              <Droplets className="h-3 w-3" />
                              {h.precipitationProbability}%
                            </div>
                          )}
                          {h.windSpeed !== null && (
                            <p className="text-[10px] text-slate-400">
                              {Math.round(h.windSpeed)} {windUnit}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 7-Day Forecast */}
            {daily && daily.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>7-Day Forecast</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {daily.map((d: DailyWeather, i: number) => (
                      <div
                        key={d.date}
                        className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="w-28 shrink-0">
                          <p className="text-sm font-semibold text-slate-800">{dayName(d.date, i)}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{d.date}</p>
                        </div>
                        <div className="flex items-center gap-2.5 flex-1 min-w-[120px]">
                          <ConditionIcon code={d.conditionCode} size="h-5 w-5" />
                          <p className="text-sm text-slate-600 truncate">{d.condition}</p>
                        </div>
                        <div className="flex items-center gap-1.5 min-w-[56px]">
                          {d.precipitationProbabilityMax > 0 ? (
                            <>
                              <Droplets className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-sm text-blue-600 font-medium">
                                {d.precipitationProbabilityMax}%
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-slate-300">\u2014</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 min-w-[80px]">
                          <Wind className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm text-slate-500">
                            {d.windSpeedMax !== null ? `${Math.round(d.windSpeedMax)} ${windUnit}` : '--'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 min-w-[100px] justify-end">
                          <div className="flex items-center gap-1 text-blue-500">
                            <ArrowDown className="h-3 w-3" />
                            <span className="text-sm font-semibold">
                              {d.temperatureMin !== null ? Math.round(d.temperatureMin) : '--'}
                            </span>
                          </div>
                          <span className="text-slate-300">/</span>
                          <div className="flex items-center gap-1 text-orange-500">
                            <ArrowUp className="h-3 w-3" />
                            <span className="text-sm font-bold">
                              {d.temperatureMax !== null ? Math.round(d.temperatureMax) : '--'}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">{tempUnit}</span>
                        </div>
                        {d.uvIndexMax !== null && (
                          <div className="hidden sm:block">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${uvColor(
                                Math.round(d.uvIndexMax)
                              )}`}
                            >
                              UV {Math.round(d.uvIndexMax)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sunrise / Sunset */}
            {daily && daily[0] && (daily[0].sunrise || daily[0].sunset) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {daily[0].sunrise && (
                  <Card>
                    <CardContent className="flex items-center gap-4 py-5">
                      <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-500">
                        <Sun className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Sunrise</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {new Date(daily[0].sunrise).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {daily[0].sunset && (
                  <Card>
                    <CardContent className="flex items-center gap-4 py-5">
                      <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-500">
                        <Sun className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Sunset</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {new Date(daily[0].sunset).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
