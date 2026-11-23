import { AlertCircle } from 'lucide-react';
import PollutionOutlook from '../../../components/aqi/PollutionOutlook';
import AQITrendChart from '../../../components/charts/AQITrendChart';
import PollutantTrendChart from '../../../components/charts/PollutantTrendChart';
import type { ActiveLocation } from '../../../context/LocationContext';
import type { AirQualityData, HistoricalDataPoint } from '../../../types';

interface TrendsAndOutlookProps {
  aqiData: AirQualityData | null;
  history: HistoricalDataPoint[];
  activeLocation: ActiveLocation;
}

export default function TrendsAndOutlook({
  aqiData,
  history,
  activeLocation,
}: TrendsAndOutlookProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-8 space-y-8">
        <AQITrendChart data={history} />
        <PollutantTrendChart data={history} />
      </div>
      <div className="lg:col-span-4 h-full">
        {aqiData ? (
          <PollutionOutlook
            location={aqiData.location}
            aqi={aqiData.aqi}
            status={aqiData.status}
            activeLocation={activeLocation}
          />
        ) : (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 text-center">
            <AlertCircle className="h-5 w-5 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700 mt-2">Outlook unavailable</p>
            <p className="text-[11px] text-slate-500 mt-1">
              A forecast is shown once a current reading has been retrieved.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
