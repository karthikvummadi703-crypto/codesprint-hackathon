import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { addCarbonTrip } from '../../services/dataService';
import { useCarbonCalculation } from './useCarbonCalculation';
import { useCarbonTrips } from './useCarbonTrips';
import { useTripForm } from './useTripForm';

export function useCarbonFootprint() {
  const { user } = useAuth();
  const form = useTripForm();
  const tripsLog = useCarbonTrips();
  const calculation = useCarbonCalculation(form);
  const [saving, setSaving] = useState(false);

  const handleSaveTrip = async () => {
    const { calculatedTrip } = calculation;
    if (!calculatedTrip || !user) return;
    setSaving(true);
    try {
      await addCarbonTrip(user.uid, {
        origin: calculatedTrip.origin,
        destination: calculatedTrip.destination,
        distanceKm: calculatedTrip.distanceKm,
        mode: calculatedTrip.mode,
        co2eKg: calculatedTrip.co2eKg,
        date: calculatedTrip.date.toISOString(),
        savings: calculatedTrip.savings || 0,
      });
      await tripsLog.reloadTrips();
      calculation.setCalculatedTrip(null);
      form.resetForm();
    } finally {
      setSaving(false);
    }
  };

  return { form, tripsLog, calculation, saving, handleSaveTrip };
}

export type CarbonFootprintController = ReturnType<typeof useCarbonFootprint>;
