import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Trash2 } from 'lucide-react';
import { TRAVEL_MODE_ICONS } from '../../services/carbonConstants';
import { CarbonTrip } from '../../types';

function TripRow({ trip, onDelete }: { trip: CarbonTrip; onDelete: (id: string) => void }) {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="px-6 py-4 text-xs text-slate-500">
        {trip.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
      </td>
      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
        {trip.origin} → {trip.destination}
      </td>
      <td className="px-6 py-4 text-sm text-slate-600">{trip.distanceKm} km</td>
      <td className="px-6 py-4 text-sm text-slate-600">
        {TRAVEL_MODE_ICONS[trip.mode]} {trip.mode}
      </td>
      <td className="px-6 py-4 text-sm text-slate-950 font-semibold">{trip.co2eKg} kg</td>
      <td className="px-6 py-4 text-xs">
        {trip.savings && trip.savings > 0 ? (
          <Badge variant="success">Saved {trip.savings} kg</Badge>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
      <td className="px-6 py-4">
        <button
          type="button"
          aria-label={`Delete trip from ${trip.origin} to ${trip.destination}`}
          onClick={() => onDelete(trip.id)}
          className="text-slate-400 hover:text-red-500 p-1 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

interface TripsTableProps {
  trips: CarbonTrip[];
  onDelete: (id: string) => void;
}

export function TripsTable({ trips, onDelete }: TripsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Trips Log</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {trips.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Date
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Route
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Distance
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Mode
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  CO₂e Impact
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Savings
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map(trip => (
                <TripRow key={trip.id} trip={trip} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center text-slate-400 py-12 text-sm">No trips saved yet.</div>
        )}
      </CardContent>
    </Card>
  );
}
