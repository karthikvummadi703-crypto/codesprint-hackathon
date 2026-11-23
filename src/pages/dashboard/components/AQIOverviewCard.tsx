import { AlertCircle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import AQIGauge from '../../../components/aqi/AQIGauge';
import type { AirQualityData } from '../../../types';

interface AQIOverviewCardProps {
  aqiData: AirQualityData | null;
  loading: boolean;
}

export default function AQIOverviewCard({ aqiData, loading }: AQIOverviewCardProps) {
  return (
    <Card className="lg:col-span-4 h-full flex flex-col">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Air Quality Index</CardTitle>
        {loading && <RefreshCw className="h-4 w-4 text-brand-500 animate-spin" />}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center py-6">
        {aqiData ? (
          <>
            <AQIGauge aqi={aqiData.aqi} />

            <div className="text-center mt-4">
              <Badge variant={aqiData.aqi > 100 ? 'warning' : 'success'} className="mb-2">
                {aqiData.status}
              </Badge>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 justify-center">
                <span>
                  Dominant Pollutant: <strong>{aqiData.dominantPollutant}</strong>
                </span>
                <span className="text-red-500 font-semibold flex items-center gap-0.5">
                  <ArrowUpRight className="h-3 w-3" />+{aqiData.change24h} (24h)
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="h-6 w-6 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 mt-2">
              {loading ? 'Loading reading' : 'No reading yet'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
              {loading
                ? 'Contacting the air quality provider.'
                : 'No air quality reading is available for this location right now.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
