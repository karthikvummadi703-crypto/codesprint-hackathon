import { ArrowDown, ArrowUp, Droplets, Wind } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DailyWeather } from '../../services/backendService';
import ConditionIcon from './ConditionIcon';
import { dayName, uvColor } from './helpers';

interface DailyForecastProps {
  daily: DailyWeather[];
  tempUnit: string;
  windUnit: string;
}

export default function DailyForecast({ daily, tempUnit, windUnit }: DailyForecastProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>7-Day Forecast</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {daily.map((d: DailyWeather, i: number) => (
            <div
              key={d.date}
              className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
            >
              <div className="w-28 shrink-0">
                <p className="text-sm font-semibold text-slate-800">{dayName(d.date, i)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{d.date}</p>
              </div>
              <div className="flex items-center gap-2.5 flex-1 min-w-[120px]">
                <ConditionIcon code={d.conditionCode} size="h-5 w-5" />
                <p className="text-sm text-slate-600 truncate">{d.condition}</p>
              </div>
              <div className="flex items-center gap-1.5 min-w-[56px]">
                {d.precipitationProbabilityMax > 0 ? (
                  <>
                    <Droplets className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-sm text-blue-600 font-medium">
                      {d.precipitationProbabilityMax}%
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-slate-300">\u2014</span>
                )}
              </div>
              <div className="flex items-center gap-1 min-w-[80px]">
                <Wind className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-sm text-slate-500">
                  {d.windSpeedMax !== null ? `${Math.round(d.windSpeedMax)} ${windUnit}` : '--'}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-[100px] justify-end">
                <div className="flex items-center gap-1 text-blue-500">
                  <ArrowDown className="h-3 w-3" />
                  <span className="text-sm font-semibold">
                    {d.temperatureMin !== null ? Math.round(d.temperatureMin) : '--'}
                  </span>
                </div>
                <span className="text-slate-300">/</span>
                <div className="flex items-center gap-1 text-orange-500">
                  <ArrowUp className="h-3 w-3" />
                  <span className="text-sm font-bold">
                    {d.temperatureMax !== null ? Math.round(d.temperatureMax) : '--'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{tempUnit}</span>
              </div>
              {d.uvIndexMax !== null && (
                <div className="hidden sm:block">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${uvColor(
                      Math.round(d.uvIndexMax),
                    )}`}
                  >
                    UV {Math.round(d.uvIndexMax)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
