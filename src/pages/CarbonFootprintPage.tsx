import { BackendErrorNotice } from './carbonFootprint/BackendErrorNotice';
import { CarbonHeader } from './carbonFootprint/CarbonHeader';
import { EmptyResultCard } from './carbonFootprint/EmptyResultCard';
import { TravelCalculatorForm } from './carbonFootprint/TravelCalculatorForm';
import { TravelTipCard } from './carbonFootprint/TravelTipCard';
import { TripResultCard } from './carbonFootprint/TripResultCard';
import { TripsTable } from './carbonFootprint/TripsTable';
import { useCarbonFootprint } from './carbonFootprint/useCarbonFootprint';

export default function CarbonFootprintPage() {
  const { form, tripsLog, calculation, saving, handleSaveTrip } = useCarbonFootprint();

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <CarbonHeader totalCO2Saved={tripsLog.totalCO2Saved} />

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {calculation.error && <BackendErrorNotice error={calculation.error} />}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Card */}
          <TravelCalculatorForm
            form={form}
            loading={calculation.loading}
            onSubmit={calculation.handleCalculate}
          />

          {/* Results Card */}
          <div className="lg:col-span-5 space-y-6">
            {calculation.calculatedTrip ? (
              <TripResultCard
                trip={calculation.calculatedTrip}
                usingEstimate={calculation.usingEstimate}
                saving={saving}
                onSave={handleSaveTrip}
                onCancel={() => calculation.setCalculatedTrip(null)}
              />
            ) : (
              <EmptyResultCard />
            )}

            {/* Environmental alternative reminder */}
            <TravelTipCard />
          </div>
        </div>

        {/* Trips table */}
        <TripsTable trips={tripsLog.trips} onDelete={tripsLog.handleDeleteTrip} />
      </div>
    </div>
  );
}
