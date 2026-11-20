import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PREDICTION_METHOD, WeatherResponse } from '../../services/backendService';

interface ProvenanceCardProps {
  method: string;
  provenanceNote: string;
  weather: WeatherResponse | null;
  weatherError: string;
}

export default function ProvenanceCard({
  method,
  provenanceNote,
  weather,
  weatherError,
}: ProvenanceCardProps) {
  return (
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
            Distance from the current reading, not a model accuracy. Treat it as a relative indicator when
            comparing points within this window.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
