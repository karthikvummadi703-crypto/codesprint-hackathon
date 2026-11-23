import LocationPicker from '../../components/LocationPicker';
import { useLocation } from '../../context/LocationContext';
import AQIOverviewCard from './components/AQIOverviewCard';
import DashboardHeader from './components/DashboardHeader';
import ErrorAlert from './components/ErrorAlert';
import HealthAndWeather from './components/HealthAndWeather';
import PollutantDetails from './components/PollutantDetails';
import TrendsAndOutlook from './components/TrendsAndOutlook';
import { useDashboardController } from './hooks/useDashboardController';

export default function DashboardContent() {
  const controller = useDashboardController();
  const { location: activeLocation } = useLocation();

  if (!activeLocation) return <LocationPicker compact />;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <DashboardHeader controller={controller} activeLocation={activeLocation} />
      <ErrorAlert controller={controller} activeLocation={activeLocation} />

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <AQIOverviewCard aqiData={controller.aqiData} loading={controller.loading} />
          <HealthAndWeather aqiData={controller.aqiData} activeLocation={activeLocation} />
        </div>

        <PollutantDetails aqiData={controller.aqiData} />

        <TrendsAndOutlook
          aqiData={controller.aqiData}
          history={controller.history}
          activeLocation={activeLocation}
        />
      </div>
    </div>
  );
}
