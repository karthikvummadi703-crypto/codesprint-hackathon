import { Sun } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { DailyWeather } from '../../services/backendService';

interface SunTimesProps {
  day: DailyWeather;
}

export default function SunTimes({ day }: SunTimesProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {day.sunrise && (
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-500">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Sunrise</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">
                {new Date(day.sunrise).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {day.sunset && (
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-500">
              <Sun className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Sunset</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">
                {new Date(day.sunset).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
