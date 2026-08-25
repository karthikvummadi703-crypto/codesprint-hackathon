import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import PredictionForecastChart from '../components/charts/PredictionForecastChart';
import { MOCK_PREDICTIONS } from '../services/mockAirQualityService';
import { ArrowUpRight, TrendingUp, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { getAQIBadgeVariant } from '../components/ui/Badge';
import { fetchPredictions } from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import { listAirQualityRecords, savePredictions } from '../services/dataService';
import { PredictionForecast } from '../types';

export default function PredictionsPage() {
  const { user } = useAuth();
  const [forecasts, setForecasts] = useState<PredictionForecast[]>(MOCK_PREDICTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingMock, setUsingMock] = useState(false);
  const [locationLabel, setLocationLabel] = useState('Gudur');

  const load = async () => {
    setLoading(true);
    setError('');
    let lat: number | undefined;
    let lon: number | undefined;
    let city: string | undefined = 'Gudur';

    if (user) {
      try {
        const records = await listAirQualityRecords(user.uid, 1);
        const last = records[0];
        if (last?.location) {
          city = last.location;
          setLocationLabel(last.location);
          if (last.lat && last.lon) {
            lat = Number(last.lat);
            lon = Number(last.lon);
          }
        }
      } catch {
        // ignore
      }
    }

    try {
      const data = await fetchPredictions({ lat, lon, city });
      const list = Array.isArray(data.predictions) ? data.predictions : [];
      if (list.length > 0) {
        setForecasts(list);
        setUsingMock(data.source === 'mock');
        if (user) savePredictions(user.uid, list).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const latestForecast = forecasts[forecasts.length - 1];
  const firstForecast = forecasts[0];
  const aqiDiff = latestForecast.aqi - firstForecast.aqi;
  const peak = forecasts.reduce((max, f) => (f.aqi > max ? f.aqi : max), 0);
  const avgConfidence = Math.round(
    forecasts.filter((f) => f.timeOffsetHours > 0).reduce((acc, f) => acc + (f.confidence || 0), 0) /
      Math.max(1, forecasts.filter((f) => f.timeOffsetHours > 0).length)
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Future Pollution Predictions</h1>
            <p className="text-xs text-slate-500 mt-1">
              Prototype 24-hour air quality forecast for <span className="font-semibold text-slate-700">{locationLabel}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {usingMock && <Badge variant="warning" className="h-7">Prototype forecast</Badge>}
            <Button variant="outline" size="sm" onClick={load} loading={loading} className="h-9">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Could not load forecasts</p>
              <p className="text-xs mt-1">{error} Showing last available predictions.</p>
            </div>
          </div>
        )}

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
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-slate-900">
                  {firstForecast.aqi} → {latestForecast.aqi}
                </span>
                <span className={`text-xs font-semibold ${aqiDiff < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {aqiDiff < 0 ? `${aqiDiff} (Improvement)` : `+${aqiDiff} (Worsening)`}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                AQI is projected to peak at <strong className="text-red-500">{peak}</strong> during the forecast window. Prototype estimate — not scientifically exact.
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
                <Badge variant="success">Prototype</Badge>
              </div>
              <div className="text-4xl font-extrabold text-slate-900">
                {avgConfidence}% <span className="text-lg font-normal text-slate-400">Avg Score</span>
              </div>
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                Confidence reflects how close a given forecast point is to the current reading. It is a prototype indicator, not a validated model accuracy.
              </p>
            </CardContent>
          </Card>

          {/* AI Forecast Insight */}
          <Card className="bg-brand-50 border-brand-100 flex flex-col justify-between">
            <CardContent className="pt-6 flex gap-3.5">
              <div className="p-2 bg-brand-100 rounded-xl text-brand-700 h-fit">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-brand-900 text-sm">Forecast Insight</h4>
                <p className="text-xs text-brand-700 leading-relaxed mt-1">
                  {aqiDiff < 0
                    ? 'Conditions are expected to improve over the next 24 hours. Air quality should become more favorable for outdoor activity later in the window.'
                    : 'Pollution is expected to build over the next 24 hours. Plan outdoor activities earlier in the day and keep windows closed at peak levels.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

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
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Time Interval
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    AQI Status
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    PM2.5
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    PM10
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    NO₂
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    O₃
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    CO
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {forecasts.map((row) => (
                  <tr key={row.timeOffsetHours} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{row.label}</td>
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
      </div>
    </div>
  );
}