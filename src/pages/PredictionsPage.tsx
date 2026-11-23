import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import PredictionForecastChart from '../components/charts/PredictionForecastChart';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Wind,
  Droplets,
  Sun,
  Eye,
  Info,
  Clock,
} from 'lucide-react';
import { getAQIBadgeVariant } from '../components/ui/Badge';
import { PREDICTION_METHOD } from '../services/backendService';
import { useLocation } from '../context/LocationContext';
import LocationPicker from '../components/LocationPicker';
import { usePredictions } from './dashboard/hooks/usePredictions';

function windDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8]!;
}

function hourLabel(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts.slice(11, 16);
  }
}

export default function PredictionsPage() {
  const {
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
    guidance,
    current,
    tempUnit,
    windUnit,
    hourly,
  } = usePredictions();
  const { location } = useLocation();

  if (!location) return <LocationPicker compact />;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Future Pollution Predictions</h1>
            <p className="text-xs text-slate-500 mt-1">
              24-hour air quality outlook for{' '}
              <span className="font-semibold text-slate-700">{locationLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {method === PREDICTION_METHOD.MODEL && (
              <Badge variant="success" className="h-7" title={provenanceNote}>
                Model forecast
              </Badge>
            )}
            {method === PREDICTION_METHOD.HEURISTIC && (
              <Badge variant="warning" className="h-7" title={provenanceNote}>
                Estimated
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              loading={loading}
              className="h-9"
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Could not load forecasts</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {forecasts.length === 0 && !loading ? (
          <Card>
            <CardContent className="flex items-start gap-3 py-8">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800 text-sm">No forecast available</p>
                <p className="text-xs text-slate-500 mt-1">
                  No air quality forecast could be retrieved for {locationLabel}. Check the location
                  and try again, or ask the assistant a question instead.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Forecast overview & insight cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Summary Card */}
              <Card className="flex flex-col justify-between">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      24h AQI Forecast Trend
                    </span>
                    <TrendingUp className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-4xl font-extrabold text-slate-900">
                      {firstForecast?.aqi ?? '--'} → {latestForecast?.aqi ?? '--'}
                    </span>
                    {forecasts.length > 1 &&
                      (aqiDiff < 0 ? (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          <TrendingDown className="h-3.5 w-3.5" /> {aqiDiff} (improving)
                        </span>
                      ) : aqiDiff > 0 ? (
                        <span className="text-xs font-semibold text-red-500 flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5" /> +{aqiDiff} (worsening)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                          <Minus className="h-3.5 w-3.5" /> steady
                        </span>
                      ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                    {forecasts.length > 0 ? (
                      <>
                        AQI is projected to peak at <strong className="text-red-500">{peak}</strong>{' '}
                        during the forecast window.{' '}
                        {method === PREDICTION_METHOD.MODEL
                          ? 'This is a dispersion-model forecast, not an observation.'
                          : 'This is an offline estimate, not a validated forecast.'}
                      </>
                    ) : (
                      'No forecast points are available to summarise.'
                    )}
                  </p>
                </CardContent>
              </Card>

              {/* Confidence Score Card */}
              <Card className="flex flex-col justify-between">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Forecast Confidence
                    </span>
                    <Badge variant={method === PREDICTION_METHOD.MODEL ? 'success' : 'warning'}>
                      {method === PREDICTION_METHOD.MODEL ? 'Model' : 'Estimated'}
                    </Badge>
                  </div>
                  <div className="text-4xl font-extrabold text-slate-900">
                    {avgConfidence}%{' '}
                    <span className="text-lg font-normal text-slate-400">Avg Score</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                    Confidence reflects how close a given forecast point is to the current reading.
                    It is an indicator, not a validated model accuracy. {provenanceNote}
                  </p>
                </CardContent>
              </Card>

              {/* Activity guidance, keyed to the worst point in the window */}
              <Card className="bg-brand-50 border-brand-100 flex flex-col justify-between">
                <CardContent className="pt-6 flex gap-3.5">
                  <div className="p-2 bg-brand-100 rounded-xl text-brand-700 h-fit">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-brand-900 text-sm">Activity Guidance</h3>
                    <p className={`text-xs font-semibold mt-1 ${guidance.tone}`}>
                      {guidance.title}
                    </p>
                    <p className="text-xs text-brand-700 leading-relaxed mt-1">{guidance.body}</p>
                    {worst && (
                      <p className="text-[11px] text-brand-500 mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Worst point {worst.label} at AQI {worst.aqi} ({worst.status})
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Provenance — what kind of number this is */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-slate-400" /> Data sources and method
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="font-semibold text-slate-700">Pollution forecast</p>
                  <p className="text-slate-500 mt-1 leading-relaxed">
                    {method === PREDICTION_METHOD.MODEL
                      ? `Atmospheric dispersion model via ${provenanceNote || 'the configured provider'}. A model projection, not a measurement.`
                      : method === PREDICTION_METHOD.HEURISTIC
                        ? 'Offline estimate derived from the current reading. Directional only — it has not been validated against observations.'
                        : 'No forecast provider was available for this request.'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Meteorology</p>
                  <p className="text-slate-500 mt-1 leading-relaxed">
                    {weather
                      ? `Live observations and forecast from ${weather.source}, timezone ${weather.timezone}.`
                      : weatherError
                        ? `Unavailable: ${weatherError}`
                        : 'Not loaded.'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Confidence score</p>
                  <p className="text-slate-500 mt-1 leading-relaxed">
                    Distance from the current reading, not a model accuracy. Treat it as a relative
                    indicator when comparing points within this window.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Weather drivers alongside the pollution curve */}
            {hourly.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wind className="h-4 w-4 text-brand-600" /> Meteorological conditions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {current && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 mb-5 border-b border-slate-100">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Sun className="h-3 w-3" /> Conditions
                        </p>
                        <p className="text-lg font-bold text-slate-900 mt-1">
                          {current.temperature !== null
                            ? `${Math.round(current.temperature)}${tempUnit}`
                            : '--'}
                        </p>
                        <p className="text-[11px] text-slate-500">{current.condition}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Wind className="h-3 w-3" /> Wind
                        </p>
                        <p className="text-lg font-bold text-slate-900 mt-1">
                          {current.windSpeed !== null
                            ? `${Math.round(current.windSpeed)} ${windUnit}`
                            : '--'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {current.windDirection !== null
                            ? `From ${windDeg(current.windDirection)}`
                            : ''}
                          {current.windSpeed !== null && current.windSpeed < 3
                            ? ' — weak winds trap pollution'
                            : ' — disperses pollutants'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Droplets className="h-3 w-3" /> Humidity
                        </p>
                        <p className="text-lg font-bold text-slate-900 mt-1">
                          {current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Rain chance{' '}
                          {current.precipitationProbability !== null
                            ? `${Math.round(current.precipitationProbability)}%`
                            : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                          <Eye className="h-3 w-3" /> UV index
                        </p>
                        <p className="text-lg font-bold text-slate-900 mt-1">
                          {current.uvIndex !== null ? Math.round(current.uvIndex) : '--'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {current.uvIndex !== null && current.uvIndex >= 6
                            ? 'High UV — drives ozone formation'
                            : 'Low UV contribution'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <div className="flex gap-2 min-w-max">
                      {hourly.slice(0, 24).map(h => {
                        const match = forecasts.find(f => f.label === hourLabel(h.timestamp));
                        return (
                          <div
                            key={h.timestamp}
                            className="flex flex-col items-center gap-1 min-w-[64px] px-2 py-2.5 rounded-lg bg-slate-50 border border-slate-100"
                          >
                            <span className="text-[10px] font-semibold text-slate-500">
                              {hourLabel(h.timestamp)}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {h.temperature !== null ? `${Math.round(h.temperature)}°` : '--'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {h.windSpeed !== null
                                ? `${Math.round(h.windSpeed)} ${windUnit}`
                                : '--'}
                            </span>
                            {h.precipitationProbability > 0 && (
                              <span className="text-[10px] text-blue-600">
                                {h.precipitationProbability}%
                              </span>
                            )}
                            {match && (
                              <span className="text-[10px] font-bold text-slate-700 mt-0.5">
                                AQI {match.aqi}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">
                    Wind speed is the main control on this curve: strong mixing lowers particulates,
                    while still air lets them accumulate. Rain is not a reliable clean-up — wet
                    deposition only removes what is already airborne.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Prediction Chart */}
            <PredictionForecastChart forecasts={forecasts} />

            {/* Forecast Table */}
            <Card>
              <CardHeader>
                <CardTitle>Detailed Forecast Matrix</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        Time Interval
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        AQI Status
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        PM2.5
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        PM10
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        NO₂
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        O₃
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        CO
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {forecasts.map(row => (
                      <tr
                        key={row.timeOffsetHours}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                          {row.label}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={getAQIBadgeVariant(row.status)} className="text-[10px]">
                            {row.aqi} — {row.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{row.pm25} µg/m³</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{row.pm10} µg/m³</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{row.no2} µg/m³</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{row.o3} µg/m³</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{row.co} mg/m³</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
