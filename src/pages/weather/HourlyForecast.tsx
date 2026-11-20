import { Droplets } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { HourlyWeather } from '../../services/backendService';
import ConditionIcon from './ConditionIcon';
import { hourLabel } from './helpers';

interface HourlyForecastProps {
  hourly: HourlyWeather[];
  tempUnit: string;
  windUnit: string;
}

export default function HourlyForecast({ hourly, tempUnit, windUnit }: HourlyForecastProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>24-Hour Forecast</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="flex gap-3 p-5 min-w-max">
            {hourly.slice(0, 24).map((h: HourlyWeather) => (
              <div
                key={h.timestamp}
                className="flex flex-col items-center gap-2 min-w-[72px] px-3 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-300 transition-colors"
              >
                <p className="text-[11px] font-semibold text-slate-500">{hourLabel(h.timestamp)}</p>
                <ConditionIcon code={h.conditionCode} size="h-5 w-5" />
                <p className="text-base font-bold text-slate-900">
                  {h.temperature !== null ? `${Math.round(h.temperature)}${tempUnit}` : '--'}
                </p>
                {h.precipitationProbability > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] text-blue-600">
                    <Droplets className="h-3 w-3" />
                    {h.precipitationProbability}%
                  </div>
                )}
                {h.windSpeed !== null && (
                  <p className="text-[10px] text-slate-400">
                    {Math.round(h.windSpeed)} {windUnit}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
