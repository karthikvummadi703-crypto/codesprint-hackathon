/** Dashboard readings, charts, advisories, and error state. */
import { AlertCircle, ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react';

import AQIGauge from '../../components/aqi/AQIGauge';
import HealthAdvisory from '../../components/aqi/HealthAdvisory';
import PollutantCard from '../../components/aqi/PollutantCard';
import PollutionOutlook from '../../components/aqi/PollutionOutlook';
import AQITrendChart from '../../components/charts/AQITrendChart';
import PollutantTrendChart from '../../components/charts/PollutantTrendChart';
import WeatherCard from '../../components/WeatherCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { toLocationParams } from '../../context/LocationContext';
import type { ActiveLocation } from '../../context/LocationContext';
import type { useDashboard } from './useDashboard';

interface Props {
  dashboard: ReturnType<typeof useDashboard>;
  activeLocation: ActiveLocation;
}

export default function DashboardContent({ dashboard, activeLocation }: Props) {
  const { error, aqiData, loading, history, retry } = dashboard;

  return (
    <>
      {error && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700"
          >
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">Could not load air quality data</p>
              <p className="text-xs mt-1">{error}</p>
              <p className="text-xs mt-1">
                Make sure the backend is running (uvicorn main:app --reload --port 8001).
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={retry}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {/* Main AQI Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* AQI Overview Card (Gauge) */}
          <Card className="lg:col-span-4 h-full flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Air Quality Index</CardTitle>
              {loading && <RefreshCw className="h-4 w-4 text-brand-500 animate-spin" />}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center py-6">
              {aqiData ? (
                <>
                  <AQIGauge aqi={aqiData.aqi} />

                  <div className="text-center mt-4">
                    <Badge variant={aqiData.aqi > 100 ? 'warning' : 'success'} className="mb-2">
                      {aqiData.status}
                    </Badge>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 justify-center">
                      <span>
                        Dominant Pollutant: <strong>{aqiData.dominantPollutant}</strong>
                      </span>
                      <span className="text-red-500 font-semibold flex items-center gap-0.5">
                        <ArrowUpRight className="h-3 w-3" />+{aqiData.change24h} (24h)
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-6 w-6 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700 mt-2">
                    {loading ? 'Loading reading' : 'No reading yet'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
                    {loading
                      ? 'Contacting the air quality provider.'
                      : 'No air quality reading is available for this location right now.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Health Advisory card */}
          <div className="lg:col-span-8 h-full flex flex-col gap-6">
            {aqiData && (
              <HealthAdvisory status={aqiData.status} advisory={aqiData.healthAdvisory} aqi={aqiData.aqi} />
            )}

            <WeatherCard params={toLocationParams(activeLocation)} />

            {/* Environmental Insight Card */}
            {aqiData && (
              <Card className="bg-brand-50 border-brand-100 flex-1">
                <CardContent className="flex items-start gap-4">
                  <div className="p-3 bg-brand-100 rounded-xl text-brand-700 mt-1">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-brand-900 text-sm">Environmental Insight</h3>
                    <p className="text-xs text-brand-700 leading-relaxed mt-1">
                      Current AQI ({aqiData.aqi}) is primarily driven by {aqiData.dominantPollutant}.{' '}
                      {aqiData.aqi > 100
                        ? 'Sensitive groups should reduce prolonged outdoor exertion. Wearing a mask is recommended during your commute.'
                        : 'Air quality is within acceptable limits for most people.'}{' '}
                      Airflow patterns in the coming hours will influence how levels evolve — check
                      Predictions for the 24-hour outlook.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Pollutants Grid */}
        {aqiData && aqiData.pollutants.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-4">Pollutant Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {aqiData.pollutants.map((pollutant) => (
                <PollutantCard key={pollutant.id} pollutant={pollutant} />
              ))}
            </div>
          </div>
        )}

        {/* Charts & Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <AQITrendChart data={history} />
            <PollutantTrendChart data={history} />
          </div>
          <div className="lg:col-span-4 h-full">
            {aqiData ? (
              <PollutionOutlook
                location={aqiData.location}
                aqi={aqiData.aqi}
                status={aqiData.status}
                activeLocation={activeLocation}
              />
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 text-center">
                <AlertCircle className="h-5 w-5 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700 mt-2">Outlook unavailable</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  A forecast is shown once a current reading has been retrieved.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
