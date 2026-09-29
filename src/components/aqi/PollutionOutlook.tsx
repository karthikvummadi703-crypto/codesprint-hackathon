import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Info, AlertCircle, Loader2 } from 'lucide-react';
import { LocationInfo, PredictionForecast, AQIStatus } from '../../types';
import { fetchPredictions } from '../../services/backendService';
import { toLocationParams, ActiveLocation } from '../../context/LocationContext';
import { Badge } from '../ui/Badge';

interface PollutionOutlookProps {
  location: LocationInfo;
  aqi: number;
  status: AQIStatus;
  activeLocation: ActiveLocation;
}

/** US EPA AQI band colours, used for the outlook cells and the legend. */
const BANDS: { max: number; label: string; color: string; bg: string }[] = [
  { max: 50, label: 'Good', color: '#10B981', bg: 'bg-emerald-50' },
  { max: 100, label: 'Moderate', color: '#F59E0B', bg: 'bg-amber-50' },
  { max: 150, label: 'Unhealthy (SG)', color: '#F97316', bg: 'bg-orange-50' },
  { max: 200, label: 'Unhealthy', color: '#EF4444', bg: 'bg-red-50' },
  { max: 300, label: 'Very Unhealthy', color: '#8B5CF6', bg: 'bg-violet-50' },
  { max: Infinity, label: 'Hazardous', color: '#7F1D1D', bg: 'bg-rose-50' },
];

function bandFor(aqi: number) {
  return BANDS.find((b) => aqi <= b.max) ?? BANDS[BANDS.length - 1];
}

/**
 * The next 24 hours for the pinned point.
 *
 * This panel used to draw a stylised map with invented per-neighbourhood
 * readings ("Industrial Zone AQI 175", "Railway Station AQI 155") that had no
 * relationship to the selected location. The providers we use return a single
 * value for one coordinate, so the honest visualisation of that is the time
 * axis, not a fake map.
 */
export default function PollutionOutlook({ location, aqi, status, activeLocation }: PollutionOutlookProps) {
  const [forecast, setForecast] = useState<PredictionForecast[]>([]);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = toLocationParams(activeLocation);
    fetchPredictions({ ...params, days: 1 })
      .then((data) => {
        if (cancelled) return;
        setForecast(Array.isArray(data.predictions) ? data.predictions : []);
        setMethod(typeof data.method === 'string' ? data.method : '');
        setNote(typeof data.note === 'string' ? data.note : '');
      })
      .catch((e) => {
        if (cancelled) return;
        setForecast([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLocation.name, activeLocation.latitude, activeLocation.longitude]);

  const points = useMemo(
    () => forecast.filter((f) => Number.isFinite(f.aqi)).slice(0, 8),
    [forecast]
  );

  const band = bandFor(aqi);
  const isModelForecast = method === 'provider-forecast';

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-4 w-4 text-brand-600 shrink-0" />
          <span className="text-sm font-semibold text-slate-800 truncate">{location.name}</span>
        </div>
        <div
          className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded-lg shrink-0"
          title="Air quality providers return one value for a single coordinate, not a per-neighbourhood grid."
        >
          <Info className="h-3 w-3" />
          Single-point reading
        </div>
      </div>

      {/* Now */}
      <div className={`px-5 py-4 ${band.bg}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Now</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: band.color }}>
                {Math.round(aqi)}
              </span>
              <span className="text-sm font-medium text-slate-600">{status}</span>
            </div>
          </div>
          {points.length > 0 && (
            <Badge variant={isModelForecast ? 'success' : 'warning'} title={note} className="text-[10px]">
              {isModelForecast ? 'Model forecast' : 'Estimated'}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
          {location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}
        </p>
      </div>

      {/* Outlook */}
      <div className="px-5 py-4 border-t border-slate-100 min-h-[132px]">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 h-24 justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading outlook
          </div>
        ) : error || points.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-center h-24">
            <AlertCircle className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">No outlook available</p>
            <p className="text-[11px] text-slate-500 max-w-[240px]">
              {error
                ? `The forecast service could not be reached (${error}).`
                : `No forecast could be retrieved for ${location.name}. The reading above is still current.`}
            </p>
          </div>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Next {points.length > 1 ? 'hours' : 'hour'}
            </div>
            <div className="flex items-end gap-1 h-16">
              {points.map((p) => {
                const b = bandFor(p.aqi);
                const height = Math.max(12, Math.min(100, (p.aqi / 300) * 100));
                return (
                  <div
                    key={p.label || p.timeOffsetHours}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${p.label}: AQI ${Math.round(p.aqi)} (${p.status})`}
                  >
                    <span className="text-[9px] font-semibold text-slate-500 tabular-nums">
                      {Math.round(p.aqi)}
                    </span>
                    <div
                      className="w-full rounded-t transition-all duration-500"
                      style={{ height: `${height}%`, backgroundColor: b.color, opacity: 0.85 }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {points.map((p) => (
                <span
                  key={`${p.label}-x`}
                  className="flex-1 text-center text-[9px] text-slate-400 truncate"
                >
                  {p.timeOffsetHours <= 0 ? 'now' : `+${p.timeOffsetHours}h`}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              {isModelForecast
                ? 'Dispersion-model values, not measurements.'
                : 'Offline estimate, not a validated forecast.'}
            </p>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-slate-100">
        <div className="flex items-center gap-3 flex-wrap">
          {BANDS.map((b) => (
            <div key={b.label} className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
