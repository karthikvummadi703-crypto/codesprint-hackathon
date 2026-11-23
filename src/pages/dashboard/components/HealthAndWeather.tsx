import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import HealthAdvisory from '../../../components/aqi/HealthAdvisory';
import WeatherCard from '../../../components/WeatherCard';
import { toLocationParams, type ActiveLocation } from '../../../context/LocationContext';
import type { AirQualityData } from '../../../types';

interface HealthAndWeatherProps {
  aqiData: AirQualityData | null;
  activeLocation: ActiveLocation;
}

export default function HealthAndWeather({ aqiData, activeLocation }: HealthAndWeatherProps) {
  return (
    <div className="lg:col-span-8 h-full flex flex-col gap-6">
      {aqiData && (
        <HealthAdvisory
          status={aqiData.status}
          advisory={aqiData.healthAdvisory}
          aqi={aqiData.aqi}
        />
      )}

      <WeatherCard params={toLocationParams(activeLocation)} />

      {aqiData && (
        <Card className="bg-brand-50 border-brand-100 flex-1">
          <CardContent className="flex items-start gap-4">
            <div className="p-3 bg-brand-100 rounded-xl text-brand-700 mt-1">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-900 text-sm">Environmental Insight</h3>
              <p className="text-xs text-brand-700 leading-relaxed mt-1">
                Current AQI ({aqiData.aqi}) is primarily driven by {aqiData.dominantPollutant}.{' '}
                {aqiData.aqi > 100
                  ? 'Sensitive groups should reduce prolonged outdoor exertion. Wearing a mask is recommended during your commute.'
                  : 'Air quality is within acceptable limits for most people.'}{' '}
                Airflow patterns in the coming hours will influence how levels evolve — check
                Predictions for the 24-hour outlook.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
