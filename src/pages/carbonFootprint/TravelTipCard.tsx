import { Card, CardContent } from '../../components/ui/Card';
import { Info } from 'lucide-react';

export function TravelTipCard() {
  return (
    <Card className="bg-brand-50 border-brand-100">
      <CardContent className="flex gap-3 text-xs text-brand-800 leading-relaxed pt-6">
        <Info className="h-4 w-4 shrink-0 text-brand-600" />
        <div>
          <strong>Tip:</strong> Opting for public transport or active travel instead of a personal
          car cuts your travel footprint by up to <strong>80%</strong>. Your saved trips are synced
          to your account.
        </div>
      </CardContent>
    </Card>
  );
}
