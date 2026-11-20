import { AlertCircle, MapPin, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import LocationPicker from '../components/LocationPicker';
import CurrentConditions from './weather/CurrentConditions';
import HourlyForecast from './weather/HourlyForecast';
import DailyForecast from './weather/DailyForecast';
import SunTimes from './weather/SunTimes';
import { useWeatherReport } from './weather/useWeatherReport';

export default function WeatherReportPage() {
  const {
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
  } = useWeatherReport();

  if (!location) return <LocationPicker compact />;

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
                <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">via {source}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {timestamp && (
              <span className="text-[11px] text-slate-400 hidden sm:block">
                Updated {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => load(true)} loading={loading} className="h-9">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {/* error */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700"
          >
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
            <CurrentConditions current={current} tempUnit={tempUnit} windUnit={windUnit} />

            {/* Hourly Forecast */}
            {hourly && hourly.length > 0 && (
              <HourlyForecast hourly={hourly} tempUnit={tempUnit} windUnit={windUnit} />
            )}

            {/* 7-Day Forecast */}
            {daily && daily.length > 0 && (
              <DailyForecast daily={daily} tempUnit={tempUnit} windUnit={windUnit} />
            )}

            {/* Sunrise / Sunset */}
            {daily && daily[0] && (daily[0].sunrise || daily[0].sunset) && <SunTimes day={daily[0]} />}
          </>
        )}
      </div>
    </div>
  );
}
