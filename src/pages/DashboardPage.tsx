/**
 * Dashboard route showing live AQI, location controls, forecasts, and alerts.
 */
import { MapPin } from 'lucide-react';

import LocationPicker from '../components/LocationPicker';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import DashboardContent from './dashboard/DashboardContent';
import LocationSearchBar from './dashboard/LocationSearchBar';
import { useDashboard } from './dashboard/useDashboard';

export default function DashboardPage() {
  const { user } = useAuth();
  const { location: activeLocation, setLocation } = useLocation();
  const dashboard = useDashboard({ user, activeLocation, setLocation });

  // Reachable only if the router guard is bypassed; keeps the page honest.
  if (!activeLocation) return <LocationPicker compact />;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Top navbar-style header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Urban Air Quality Intelligence</h1>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
              <MapPin className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-medium text-slate-700">
                {dashboard.currentLocation || activeLocation.name}
              </span>
              {dashboard.isEstimated && (
                <Badge
                  variant="warning"
                  className="ml-2 text-[10px]"
                  title="Derived from weather, not a measurement"
                >
                  Modelled
                </Badge>
              )}
            </div>
          </div>

          <LocationSearchBar {...dashboard} />
        </div>
      </div>

      <DashboardContent dashboard={dashboard} activeLocation={activeLocation} />
    </div>
  );
}
