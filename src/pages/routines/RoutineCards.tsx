import { CloudFog, Home, Leaf, MapPin, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DailyRoutine, RoutineCategory } from '../../types';
import { CATEGORY_LABELS } from './constants';

interface RoutineCardsProps {
  grouped: [RoutineCategory, DailyRoutine[]][];
}

export default function RoutineCards({ grouped }: RoutineCardsProps) {
  return (
    <>
      {grouped.map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {category === 'indoor-air' ? <Home className="h-5 w-5 text-brand-600" /> : null}
              {category === 'low-emission' ? <Leaf className="h-5 w-5 text-emerald-600" /> : null}
              {category === 'winter-smog' ? <CloudFog className="h-5 w-5 text-slate-600" /> : null}
              {category === 'household' ? <Users className="h-5 w-5 text-brand-600" /> : null}
              {category === 'outdoor-timing' ? <MapPin className="h-5 w-5 text-amber-600" /> : null}
              {CATEGORY_LABELS[category]}
              <span className="text-xs font-normal text-slate-400">({items.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((routine) => (
              <div key={routine.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">{routine.title}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      routine.priority === 'high'
                        ? 'bg-red-100 text-red-700'
                        : routine.priority === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {routine.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{routine.detail}</p>
                <p className="text-xs text-brand-700 mt-2 leading-relaxed">
                  <strong>Impact:</strong> {routine.impact}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
