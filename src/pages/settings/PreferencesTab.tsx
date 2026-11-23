import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Label } from '../../components/ui/Input';
import type { Units } from './types';

interface PreferencesTabProps {
  units: Units;
  onSelectUnits: (units: Units) => void;
}

export function PreferencesTab({ units, onSelectUnits }: PreferencesTabProps) {
  return (
    <div className="space-y-6">
      <CardHeader className="px-0 pt-0 pb-5">
        <CardTitle>Application Preferences</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0 space-y-4">
        <div>
          <Label id="units-label">Measurement Units</Label>
          <div role="group" aria-labelledby="units-label" className="flex gap-3">
            <button
              type="button"
              aria-pressed={units === 'metric'}
              onClick={() => onSelectUnits('metric')}
              className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
                units === 'metric'
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
              }`}
            >
              Metric (µg/m³, mg/m³)
            </button>
            <button
              type="button"
              aria-pressed={units === 'imperial'}
              onClick={() => onSelectUnits('imperial')}
              className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
                units === 'imperial'
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
              }`}
            >
              Imperial (ppm, ppb)
            </button>
          </div>
        </div>
      </CardContent>
    </div>
  );
}
