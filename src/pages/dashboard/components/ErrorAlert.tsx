import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { toLocationParams, type ActiveLocation } from '../../../context/LocationContext';
import type { DashboardController } from '../hooks/useDashboardController';

interface ErrorAlertProps {
  controller: DashboardController;
  activeLocation: ActiveLocation;
}

export default function ErrorAlert({ controller, activeLocation }: ErrorAlertProps) {
  if (!controller.error) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 mt-6">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700"
      >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">Could not load air quality data</p>
          <p className="text-xs mt-1">{controller.error}</p>
          <p className="text-xs mt-1">
            Make sure the backend is running (uvicorn main:app --reload --port 8001).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() =>
            controller.loadFromBackend(toLocationParams(activeLocation), activeLocation.name, true)
          }
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
        </Button>
      </div>
    </div>
  );
}
