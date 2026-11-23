import React, { useState } from 'react';
import { calculateCO2 } from '../../services/carbonConstants';
import { calculateCarbon } from '../../services/backendService';
import { CarbonTrip } from '../../types';
import { createTrip } from './tripUtils';
import type { TripFormController } from './useTripForm';

export function useCarbonCalculation(form: TripFormController) {
  const { from, to, distance, selectedMode } = form;
  const [calculatedTrip, setCalculatedTrip] = useState<CarbonTrip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingEstimate, setUsingEstimate] = useState(false);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    setLoading(true);
    setError('');
    setUsingEstimate(false);

    try {
      const result = await calculateCarbon({
        origin: from,
        destination: to,
        distanceKm: distance > 0 ? distance : undefined,
        mode: selectedMode,
      });
      const newTrip = createTrip({
        origin: from,
        destination: to,
        distanceKm: Number(result.distanceKm || distance),
        mode: selectedMode,
        co2eKg: result.co2eKg,
        savingsBaseKm: distance,
      });
      setCalculatedTrip(newTrip);
      setUsingEstimate(Boolean(result.estimated));
    } catch (err) {
      const co2e = calculateCO2(distance, selectedMode);
      const newTrip = createTrip({
        origin: from,
        destination: to,
        distanceKm: distance,
        mode: selectedMode,
        co2eKg: co2e,
        savingsBaseKm: distance,
      });
      setCalculatedTrip(newTrip);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return { calculatedTrip, setCalculatedTrip, loading, error, usingEstimate, handleCalculate };
}

export type CarbonCalculationController = ReturnType<typeof useCarbonCalculation>;
