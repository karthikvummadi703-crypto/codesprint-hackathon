import { Card, CardContent } from '../../components/ui/Card';
import { Footprints } from 'lucide-react';

export function EmptyResultCard() {
  return (
    <Card className="border-slate-200/60 bg-white">
      <CardContent className="py-16 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <Footprints className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">No Calculation Active</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Fill out the form on the left to see travel carbon emissions and environmental
            alternatives.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
