import PollutantCard from '../../../components/aqi/PollutantCard';
import type { AirQualityData } from '../../../types';

export default function PollutantDetails({ aqiData }: { aqiData: AirQualityData | null }) {
  if (!aqiData || aqiData.pollutants.length === 0) return null;

  return (
    <div>
      <h2 className="text-base font-bold text-slate-900 mb-4">Pollutant Details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {aqiData.pollutants.map(pollutant => (
          <PollutantCard key={pollutant.id} pollutant={pollutant} />
        ))}
      </div>
    </div>
  );
}
