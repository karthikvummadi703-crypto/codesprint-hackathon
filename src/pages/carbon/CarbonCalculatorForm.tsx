/** Travel emissions calculator form. */
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, Label } from '../../components/ui/Input';
import { TRAVEL_MODE_ICONS } from '../../services/carbonConstants';
import type { useCarbonFootprint } from './useCarbonFootprint';
import { TRAVEL_MODES } from './useCarbonFootprint';

type Props = Pick<
  ReturnType<typeof useCarbonFootprint>,
  | 'from'
  | 'setFrom'
  | 'to'
  | 'setTo'
  | 'distance'
  | 'setDistance'
  | 'selectedMode'
  | 'setSelectedMode'
  | 'loading'
  | 'handleCalculate'
>;

export default function CarbonCalculatorForm({
  from,
  setFrom,
  to,
  setTo,
  distance,
  setDistance,
  selectedMode,
  setSelectedMode,
  loading,
  handleCalculate,
}: Props) {
  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>Travel Calculator</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCalculate} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from">From (Origin)</Label>
              <Input
                id="from"
                placeholder="e.g. Gudur Station"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="to">To (Destination)</Label>
              <Input
                id="to"
                placeholder="e.g. Nellore Office"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="distance">Distance (km)</Label>
            <Input
              id="distance"
              type="number"
              step="0.1"
              placeholder="Leave blank to auto-estimate"
              value={distance || ''}
              onChange={(e) => setDistance(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <span id="travel-mode-label" className="block text-sm font-medium text-slate-700 mb-1.5">
              Mode of Travel
            </span>
            <div
              role="group"
              aria-labelledby="travel-mode-label"
              className="grid grid-cols-3 sm:grid-cols-7 gap-2"
            >
              {TRAVEL_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={selectedMode === mode}
                  onClick={() => setSelectedMode(mode)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-xs font-semibold ${
                    selectedMode === mode
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <span className="text-xl mb-1">{TRAVEL_MODE_ICONS[mode]}</span>
                  <span>{mode}</span>
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full h-11" loading={loading}>
            Calculate Emissions
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
