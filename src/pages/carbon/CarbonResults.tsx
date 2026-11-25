/** Calculated emissions result and travel tip. */
import { Footprints, Info, Leaf, ShieldCheck } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { TRAVEL_MODE_ICONS } from '../../services/carbonConstants';
import type { useCarbonFootprint } from './useCarbonFootprint';

type Props = Pick<
  ReturnType<typeof useCarbonFootprint>,
  'calculatedTrip' | 'usingEstimate' | 'saving' | 'handleSaveTrip' | 'setCalculatedTrip'
>;

export default function CarbonResults({
  calculatedTrip,
  usingEstimate,
  saving,
  handleSaveTrip,
  setCalculatedTrip,
}: Props) {
  return (
    <div className="lg:col-span-5 space-y-6">
      {calculatedTrip ? (
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
                {calculatedTrip.co2eKg} <span className="text-lg font-normal text-brand-600">kg CO₂e</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-brand-100 pt-4 text-xs text-slate-600">
              <div>
                <strong>Distance:</strong> {calculatedTrip.distanceKm} km
              </div>
              <div>
                <strong>Mode:</strong> {TRAVEL_MODE_ICONS[calculatedTrip.mode]} {calculatedTrip.mode}
              </div>
            </div>

            {usingEstimate && (
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600">
                <strong>Note:</strong> Distance is a straight-line estimate, not exact road distance.
              </div>
            )}

            {calculatedTrip.savings && calculatedTrip.savings > 0 ? (
              <div className="bg-emerald-100/50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-800">
                <ShieldCheck className="h-4 w-4 mt-0.5" />
                <div>
                  <strong>Nice job!</strong> By using {calculatedTrip.mode} instead of a regular car, you
                  saved <strong>{calculatedTrip.savings} kg CO₂e</strong>.
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button type="button" onClick={handleSaveTrip} className="flex-1" loading={saving}>
                Save to Log
              </Button>
              <Button type="button" variant="outline" onClick={() => setCalculatedTrip(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200/60 bg-white">
          <CardContent className="py-16 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Footprints className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">No Calculation Active</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Fill out the form on the left to see travel carbon emissions and environmental alternatives.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-brand-50 border-brand-100">
        <CardContent className="flex gap-3 text-xs text-brand-800 leading-relaxed pt-6">
          <Info className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          <div>
            <strong>Tip:</strong> Opting for public transport or active travel instead of a personal car cuts
            your travel footprint by up to <strong>80%</strong>. Your saved trips are synced to your account.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
