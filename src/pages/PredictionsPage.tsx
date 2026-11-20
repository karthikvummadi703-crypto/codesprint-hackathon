import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import PredictionForecastChart from '../components/charts/PredictionForecastChart';
import LocationPicker from '../components/LocationPicker';
import ForecastHeader from './predictions/ForecastHeader';
import ForecastSummary from './predictions/ForecastSummary';
import ProvenanceCard from './predictions/ProvenanceCard';
import WeatherDrivers from './predictions/WeatherDrivers';
import ForecastTable from './predictions/ForecastTable';
import { usePredictions } from './predictions/usePredictions';

export default function PredictionsPage() {
  const {
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
  } = usePredictions();

  if (!location) return <LocationPicker compact />;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <ForecastHeader
        locationLabel={locationLabel}
        method={method}
        provenanceNote={provenanceNote}
        loading={loading}
        onRefresh={() => load(true)}
      />

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
                  No air quality forecast could be retrieved for {locationLabel}. Check the location and try
                  again, or ask the assistant a question instead.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Forecast overview & insight cards */}
            <ForecastSummary
              forecasts={forecasts}
              firstForecast={firstForecast}
              latestForecast={latestForecast}
              aqiDiff={aqiDiff}
              peak={peak}
              method={method}
              provenanceNote={provenanceNote}
              avgConfidence={avgConfidence}
              guidance={guidance}
              worst={worst}
            />

            {/* Provenance — what kind of number this is */}
            <ProvenanceCard
              method={method}
              provenanceNote={provenanceNote}
              weather={weather}
              weatherError={weatherError}
            />

            {/* Weather drivers alongside the pollution curve */}
            {hourly.length > 0 && (
              <WeatherDrivers
                forecasts={forecasts}
                hourly={hourly}
                current={current}
                tempUnit={tempUnit}
                windUnit={windUnit}
              />
            )}

            {/* Prediction Chart */}
            <PredictionForecastChart forecasts={forecasts} />

            {/* Forecast Table */}
            <ForecastTable forecasts={forecasts} />
          </>
        )}
      </div>
    </div>
  );
}
