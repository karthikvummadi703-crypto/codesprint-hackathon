import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { CloudFog, Home, Leaf, MapPin, ShieldCheck, Users } from 'lucide-react';
import type { AQIStatus, DailyRoutine, RoutineCategory } from '../../../types';
import { CATEGORY_LABELS } from '../modules/constants';

interface PlanSectionProps {
  aqi: number | null;
  status: AQIStatus | null;
  locationName: string | undefined;
  sensitive: boolean;
  grouped: [RoutineCategory, DailyRoutine[]][];
}

function PlanSummary({ aqi, status, locationName, sensitive }: Omit<PlanSectionProps, 'grouped'>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> Today&apos;s plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        {aqi === null ? (
          <p className="text-sm text-slate-500">
            No live reading is available for {locationName}. General, season-aware habits are shown
            below; open the Dashboard to fetch a current reading for tighter timing advice.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Based on AQI <strong>{aqi}</strong> ({status ?? 'unknown'}) in {locationName}
            {sensitive ? ', with sensitive household members in mind' : ''}.
          </p>
        )}
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Each suggestion states the direct impact of the choice. These are practical habits, not a
          substitute for medical advice or an indoor-air measurement.
        </p>
      </CardContent>
    </Card>
  );
}

function CategoryIcon({ category }: { category: RoutineCategory }) {
  if (category === 'indoor-air') return <Home className="h-5 w-5 text-brand-600" />;
  if (category === 'low-emission') return <Leaf className="h-5 w-5 text-emerald-600" />;
  if (category === 'winter-smog') return <CloudFog className="h-5 w-5 text-slate-600" />;
  if (category === 'household') return <Users className="h-5 w-5 text-brand-600" />;
  return <MapPin className="h-5 w-5 text-amber-600" />;
}

function RoutineCard({ routine }: { routine: DailyRoutine }) {
  const priorityClass =
    routine.priority === 'high'
      ? 'bg-red-100 text-red-700'
      : routine.priority === 'medium'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-200 text-slate-600';
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">{routine.title}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityClass}`}
        >
          {routine.priority}
        </span>
      </div>
      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{routine.detail}</p>
      <p className="text-xs text-brand-700 mt-2 leading-relaxed">
        <strong>Impact:</strong> {routine.impact}
      </p>
    </div>
  );
}

function CategoryCard({ category, items }: { category: RoutineCategory; items: DailyRoutine[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CategoryIcon category={category} />
          {CATEGORY_LABELS[category]}
          <span className="text-xs font-normal text-slate-400">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(routine => (
          <RoutineCard key={routine.id} routine={routine} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function PlanSection({
  aqi,
  status,
  locationName,
  sensitive,
  grouped,
}: PlanSectionProps) {
  return (
    <div className="lg:col-span-2 space-y-6">
      <PlanSummary aqi={aqi} status={status} locationName={locationName} sensitive={sensitive} />
      {grouped.map(([category, items]) => (
        <CategoryCard key={category} category={category} items={items} />
      ))}
    </div>
  );
}
