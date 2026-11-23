import { Badge } from '../../components/ui/Badge';
import { Leaf } from 'lucide-react';

export function CarbonHeader({ totalCO2Saved }: { totalCO2Saved: number }) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Carbon Footprint Calculator</h1>
          <p className="text-xs text-slate-500 mt-1">
            Estimate and offset your travel-related carbon emissions
          </p>
        </div>
        {totalCO2Saved > 0 && (
          <Badge variant="success" className="h-7 text-xs gap-1 shrink-0">
            <Leaf className="h-3.5 w-3.5 fill-current" /> {totalCO2Saved.toFixed(1)} kg CO₂e Saved
          </Badge>
        )}
      </div>
    </div>
  );
}
