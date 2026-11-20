import { Cloud, Droplets, Eye, Gauge, Navigation, Sun, Thermometer, Umbrella, Wind } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { CurrentWeather } from '../../services/backendService';
import ConditionIcon from './ConditionIcon';
import StatTile from './StatTile';
import { uvColor, uvLabel, windDeg } from './helpers';

interface CurrentConditionsProps {
  current: CurrentWeather;
  tempUnit: string;
  windUnit: string;
}

export default function CurrentConditions({ current, tempUnit, windUnit }: CurrentConditionsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Hero */}
      <Card className="lg:col-span-1 bg-gradient-to-br from-brand-600 to-brand-800 text-white border-0 shadow-lg overflow-visible">
        <CardContent className="py-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-brand-200 text-sm font-medium">Current Conditions</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-6xl font-extrabold">
                  {current.temperature !== null ? Math.round(current.temperature) : '--'}
                </span>
                <span className="text-2xl text-brand-200">{tempUnit}</span>
              </div>
              <p className="text-brand-100 mt-1 text-lg font-medium">{current.condition}</p>
              {current.feelsLike !== null && (
                <p className="text-brand-300 text-sm mt-1">
                  Feels like {Math.round(current.feelsLike)}
                  {tempUnit}
                </p>
              )}
            </div>
            <ConditionIcon code={current.conditionCode} size="h-14 w-14" />
          </div>
          <div className="mt-6 pt-5 border-t border-white/20 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-brand-300 text-xs uppercase tracking-wide">Humidity</p>
              <p className="font-bold mt-0.5">
                {current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
              </p>
            </div>
            <div>
              <p className="text-brand-300 text-xs uppercase tracking-wide">Rain chance</p>
              <p className="font-bold mt-0.5">
                {current.precipitationProbability !== null
                  ? `${Math.round(current.precipitationProbability)}%`
                  : '--'}
              </p>
            </div>
            <div>
              <p className="text-brand-300 text-xs uppercase tracking-wide">Wind</p>
              <p className="font-bold mt-0.5">
                {current.windSpeed !== null ? `${Math.round(current.windSpeed)} ${windUnit}` : '--'}
                {current.windDirection !== null ? ` ${windDeg(current.windDirection)}` : ''}
              </p>
            </div>
            <div>
              <p className="text-brand-300 text-xs uppercase tracking-wide">UV Index</p>
              <p className="font-bold mt-0.5">
                {current.uvIndex !== null
                  ? `${Math.round(current.uvIndex)} \u2014 ${uvLabel(Math.round(current.uvIndex))}`
                  : '--'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed metrics */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">Detailed Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <StatTile
              icon={<Thermometer className="h-3.5 w-3.5" />}
              label="Feels Like"
              value={current.feelsLike !== null ? `${Math.round(current.feelsLike)}${tempUnit}` : '--'}
            />
            <StatTile
              icon={<Droplets className="h-3.5 w-3.5" />}
              label="Humidity"
              value={current.humidity !== null ? `${Math.round(current.humidity)}%` : '--'}
            />
            <StatTile
              icon={<Wind className="h-3.5 w-3.5" />}
              label="Wind Speed"
              value={current.windSpeed !== null ? `${Math.round(current.windSpeed)} ${windUnit}` : '--'}
              sub={
                current.windDirection !== null ? `Direction: ${windDeg(current.windDirection)}` : undefined
              }
            />
            <StatTile
              icon={<Umbrella className="h-3.5 w-3.5" />}
              label="Rain Chance"
              value={
                current.precipitationProbability !== null
                  ? `${Math.round(current.precipitationProbability)}%`
                  : '--'
              }
              sub={current.precipitation !== null ? `Precipitation: ${current.precipitation} mm` : undefined}
            />
            <StatTile
              icon={<Sun className="h-3.5 w-3.5" />}
              label="UV Index"
              value={current.uvIndex !== null ? String(Math.round(current.uvIndex)) : '--'}
              extra={
                current.uvIndex !== null ? (
                  <span
                    className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${uvColor(
                      Math.round(current.uvIndex),
                    )}`}
                  >
                    {uvLabel(Math.round(current.uvIndex))}
                  </span>
                ) : undefined
              }
            />
            <StatTile
              icon={<Gauge className="h-3.5 w-3.5" />}
              label="Pressure"
              value={current.pressure !== null ? `${Math.round(current.pressure)} hPa` : '--'}
            />
            <StatTile
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Visibility"
              value={current.visibility !== null ? `${Math.round(current.visibility)} km` : '--'}
            />
            <StatTile
              icon={<Cloud className="h-3.5 w-3.5" />}
              label="Cloud Cover"
              value={current.cloudCover !== null ? `${Math.round(current.cloudCover)}%` : '--'}
            />
            <StatTile
              icon={<Navigation className="h-3.5 w-3.5" />}
              label="Wind Direction"
              value={current.windDirection !== null ? `${Math.round(current.windDirection)}\u00b0` : '--'}
              sub={current.windDirection !== null ? windDeg(current.windDirection) : undefined}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
