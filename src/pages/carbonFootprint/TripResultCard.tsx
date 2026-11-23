import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Leaf, ShieldCheck } from 'lucide-react';
import { TRAVEL_MODE_ICONS } from '../../services/carbonConstants';
import { CarbonTrip } from '../../types';

function SavingsBanner({ trip }: { trip: CarbonTrip }) {
  return (
    <div className="bg-emerald-100/50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-800">
      <ShieldCheck className="h-4 w-4 mt-0.5" />
      <div>
        <strong>Nice job!</strong> By using {trip.mode} instead of a regular car, you saved{' '}
        <strong>{trip.savings} kg CO₂e</strong>.
      </div>
    </div>
  );
}

interface TripResultCardProps {
  trip: CarbonTrip;
  usingEstimate: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function TripResultCard({
  trip,
  usingEstimate,
  saving,
  onSave,
  onCancel,
}: TripResultCardProps) {
  return (
    <Card className="border-brand-200 bg-brand-50/50 shadow-md">
      <CardHeader>
        <CardTitle className="text-brand-800 flex items-center gap-2">
          <Leaf className="h-5 w-5 text-brand-600" /> Emissions Calculated
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Estimated CO2 Impact</div>
          <div className="text-4xl font-extrabold text-brand-800 mt-1">
            {trip.co2eKg} <span className="text-lg font-normal text-brand-600">kg CO₂e</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-brand-100 pt-4 text-xs text-slate-600">
          <div>
            <strong>Distance:</strong> {trip.distanceKm} km
          </div>
          <div>
            <strong>Mode:</strong> {TRAVEL_MODE_ICONS[trip.mode]} {trip.mode}
          </div>
        </div>

        {usingEstimate && (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600">
            <strong>Note:</strong> Distance is a straight-line estimate, not exact road distance.
          </div>
        )}

        {trip.savings && trip.savings > 0 ? <SavingsBanner trip={trip} /> : null}

        <div className="flex gap-2">
          <Button onClick={onSave} className="flex-1" loading={saving}>
            Save to Log
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
