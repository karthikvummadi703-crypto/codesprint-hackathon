import { RefreshCw } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { PREDICTION_METHOD } from '../../services/backendService';

interface ForecastHeaderProps {
  locationLabel: string;
  method: string;
  provenanceNote: string;
  loading: boolean;
  onRefresh: () => void;
}

export default function ForecastHeader({
  locationLabel,
  method,
  provenanceNote,
  loading,
  onRefresh,
}: ForecastHeaderProps) {
  return (
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
          <Button variant="outline" size="sm" onClick={onRefresh} loading={loading} className="h-9">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}
