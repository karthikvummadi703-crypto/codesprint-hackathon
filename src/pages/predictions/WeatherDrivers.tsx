import { Droplets, Eye, Sun, Wind } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { CurrentWeather, HourlyWeather } from '../../services/backendService';
import { PredictionForecast } from '../../types';
import { hourLabel, windDeg } from './helpers';

interface WeatherDriversProps {
  forecasts: PredictionForecast[];
  hourly: HourlyWeather[];
  current: CurrentWeather | undefined;
  tempUnit: string;
  windUnit: string;
}

export default function WeatherDrivers({
  forecasts,
  hourly,
  current,
  tempUnit,
  windUnit,
}: WeatherDriversProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Wind className="h-4 w-4 text-brand-600" /> Meteorological conditions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {current && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 mb-5 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Sun className="h-3 w-3" /> Conditions
              </p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {current.temperature !== null ? `${Math.round(current.temperature)}${tempUnit}` : '--'}
              </p>
              <p className="text-[11px] text-slate-500">{current.condition}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Wind className="h-3 w-3" /> Wind
              </p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {current.windSpeed !== null ? `${Math.round(current.windSpeed)} ${windUnit}` : '--'}
              </p>
              <p className="text-[11px] text-slate-500">
                {current.windDirection !== null ? `From ${windDeg(current.windDirection)}` : ''}
                {current.windSpeed !== null && current.windSpeed < 3
                  ? ' — weak winds trap pollution'
                  : ' — disperses pollutants'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Droplets className="h-3 w-3" /> Humidity
              </p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
              </p>
              <p className="text-[11px] text-slate-500">
                Rain chance{' '}
                {current.precipitationProbability !== null
                  ? `${Math.round(current.precipitationProbability)}%`
                  : '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Eye className="h-3 w-3" /> UV index
              </p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {current.uvIndex !== null ? Math.round(current.uvIndex) : '--'}
              </p>
              <p className="text-[11px] text-slate-500">
                {current.uvIndex !== null && current.uvIndex >= 6
                  ? 'High UV — drives ozone formation'
                  : 'Low UV contribution'}
              </p>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {hourly.slice(0, 24).map((h) => {
              const match = forecasts.find((f) => f.label === hourLabel(h.timestamp));
              return (
                <div
                  key={h.timestamp}
                  className="flex flex-col items-center gap-1 min-w-[64px] px-2 py-2.5 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <span className="text-[10px] font-semibold text-slate-500">{hourLabel(h.timestamp)}</span>
                  <span className="text-[10px] text-slate-500">
                    {h.temperature !== null ? `${Math.round(h.temperature)}°` : '--'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {h.windSpeed !== null ? `${Math.round(h.windSpeed)} ${windUnit}` : '--'}
                  </span>
                  {h.precipitationProbability > 0 && (
                    <span className="text-[10px] text-blue-600">{h.precipitationProbability}%</span>
                  )}
                  {match && (
                    <span className="text-[10px] font-bold text-slate-700 mt-0.5">AQI {match.aqi}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Wind speed is the main control on this curve: strong mixing lowers particulates, while still air
          lets them accumulate. Rain is not a reliable clean-up — wet deposition only removes what is already
          airborne.
        </p>
      </CardContent>
    </Card>
  );
}
