import { AlertTriangle, Check } from 'lucide-react';
import { Badge, getAQIBadgeVariant } from '../components/ui/Badge';
import { useLocation } from '../context/LocationContext';
import PlanSection from './routines/components/PlanSection';
import RoutinesSidebar from './routines/components/RoutinesSidebar';
import { RoutineController, useRoutines } from './routines/hooks/useRoutines';

function PageHeader({ routines }: { routines: RoutineController }) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daily Routines for Your Household</h1>
          <p className="text-xs text-slate-500 mt-1">
            Practical, low-emission routines tailored to your air and the people you care for.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={routines.winter ? 'warning' : 'success'} className="h-7">
            {routines.winter ? 'Winter smog season' : 'Outside winter smog season'}
          </Badge>
          {routines.status && (
            <Badge variant={getAQIBadgeVariant(routines.status)} className="h-7">
              AQI {routines.aqi}
            </Badge>
          )}
          {routines.saved && (
            <Badge variant="success" className="h-7">
              <Check className="h-3.5 w-3.5 mr-1" /> Saved
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700"
    >
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <span>{error}</span>
    </div>
  );
}

function RoutineGrid({
  routines,
  locationName,
}: {
  routines: RoutineController;
  locationName: string | undefined;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <PlanSection
        aqi={routines.aqi}
        status={routines.status}
        locationName={locationName}
        sensitive={routines.sensitive}
        grouped={routines.grouped}
      />
      <RoutinesSidebar controller={routines} />
    </div>
  );
}

export default function RoutinesPage() {
  const routines = useRoutines();
  const { location } = useLocation();
  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <PageHeader routines={routines} />
      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-6">
        <ErrorBanner error={routines.error} />
        <RoutineGrid routines={routines} locationName={location?.name} />
      </div>
    </div>
  );
}
