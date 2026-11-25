/**
 * Carbon footprint route for trips, household inputs, and emission summaries.
 */
import { AlertCircle, Leaf } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import CarbonCalculatorForm from './carbon/CarbonCalculatorForm';
import CarbonResults from './carbon/CarbonResults';
import CarbonTripsTable from './carbon/CarbonTripsTable';
import { useCarbonFootprint } from './carbon/useCarbonFootprint';

export default function CarbonFootprintPage() {
  const carbon = useCarbonFootprint();

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Carbon Footprint Calculator</h1>
            <p className="text-xs text-slate-500 mt-1">
              Estimate and offset your travel-related carbon emissions
            </p>
          </div>
          {carbon.totalCO2Saved > 0 && (
            <Badge variant="success" className="h-7 text-xs gap-1 shrink-0">
              <Leaf className="h-3.5 w-3.5 fill-current" /> {carbon.totalCO2Saved.toFixed(1)} kg CO₂e Saved
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {carbon.error && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Backend unavailable — used local calculation instead.</p>
              <p className="mt-0.5">{carbon.error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <CarbonCalculatorForm {...carbon} />
          <CarbonResults {...carbon} />
        </div>

        <CarbonTripsTable trips={carbon.trips} handleDeleteTrip={carbon.handleDeleteTrip} />
      </div>
    </div>
  );
}
