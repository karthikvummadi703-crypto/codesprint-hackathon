import { Clock, Minus, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent } from '../../components/ui/Card';
import { PREDICTION_METHOD } from '../../services/backendService';
import { PredictionForecast } from '../../types';

interface ForecastSummaryProps {
  forecasts: PredictionForecast[];
  firstForecast: PredictionForecast | null;
  latestForecast: PredictionForecast | null;
  aqiDiff: number;
  peak: number;
  method: string;
  provenanceNote: string;
  avgConfidence: number;
  guidance: { title: string; body: string; tone: string };
  worst: PredictionForecast | null;
}

export default function ForecastSummary({
  forecasts,
  firstForecast,
  latestForecast,
  aqiDiff,
  peak,
  method,
  provenanceNote,
  avgConfidence,
  guidance,
  worst,
}: ForecastSummaryProps) {
  return (
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
                AQI is projected to peak at <strong className="text-red-500">{peak}</strong> during the
                forecast window.{' '}
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
            {avgConfidence}% <span className="text-lg font-normal text-slate-400">Avg Score</span>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            Confidence reflects how close a given forecast point is to the current reading. It is an
            indicator, not a validated model accuracy. {provenanceNote}
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
            <p className={`text-xs font-semibold mt-1 ${guidance.tone}`}>{guidance.title}</p>
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
  );
}
