/** Carbon trip calculation, persistence, and log state. */
import { useCallback, useEffect, useState } from 'react';
import type React from 'react';

import { calculateCarbon, estimateDistance } from '../../services/backendService';
import { calculateCO2 } from '../../services/carbonConstants';
import { useAuth } from '../../context/AuthContext';
import { addCarbonTrip, deleteCarbonTrip, listCarbonTrips } from '../../services/dataService';
import type { CarbonTrip, CarbonTripRecord, TravelMode } from '../../types';

export const TRAVEL_MODES: TravelMode[] = ['Car', 'Bike', 'Bus', 'Train', 'EV', 'Walking', 'Bicycle'];

function toCarbonTrip(raw: CarbonTripRecord): CarbonTrip {
  return {
    id: raw.id,
    origin: raw.origin,
    destination: raw.destination,
    distanceKm: Number(raw.distanceKm || 0),
    mode: raw.mode as TravelMode,
    co2eKg: Number(raw.co2eKg || 0),
    date: new Date(raw.date),
    savings: raw.savings !== undefined && raw.savings !== null ? Number(raw.savings) : undefined,
  };
}

export function useCarbonFootprint() {
  const { user } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [distance, setDistance] = useState<number>(0);
  const [selectedMode, setSelectedMode] = useState<TravelMode>('Car');
  const [trips, setTrips] = useState<CarbonTrip[]>([]);
  const [calculatedTrip, setCalculatedTrip] = useState<CarbonTrip | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usingEstimate, setUsingEstimate] = useState(false);

  const reloadTrips = useCallback(async () => {
    if (!user) return;
    try {
      const records = await listCarbonTrips(user.uid);
      setTrips(records.map(toCarbonTrip));
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    reloadTrips();
  }, [reloadTrips]);

  useEffect(() => {
    if (!from.trim() || !to.trim()) return;
    const timer = setTimeout(() => {
      estimateDistance({ origin: from.trim(), destination: to.trim() })
        .then((result) => {
          if (result.distanceKm > 0) {
            setDistance(result.distanceKm);
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [from, to]);

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
      const co2e = result.co2eKg;
      const avgCarCo2 = calculateCO2(distance, 'Car');
      const savings = Math.max(0, Math.round((avgCarCo2 - co2e) * 100) / 100);

      const newTrip: CarbonTrip = {
        id: Date.now().toString(),
        origin: from,
        destination: to,
        distanceKm: Number(result.distanceKm || distance),
        mode: selectedMode,
        co2eKg: co2e,
        date: new Date(),
        savings: savings > 0 ? savings : undefined,
      };
      setCalculatedTrip(newTrip);
      setUsingEstimate(Boolean(result.estimated));
    } catch (err) {
      const co2e = calculateCO2(distance, selectedMode);
      const avgCarCo2 = calculateCO2(distance, 'Car');
      const savings = Math.max(0, Math.round((avgCarCo2 - co2e) * 100) / 100);
      const newTrip: CarbonTrip = {
        id: Date.now().toString(),
        origin: from,
        destination: to,
        distanceKm: distance,
        mode: selectedMode,
        co2eKg: co2e,
        date: new Date(),
        savings: savings > 0 ? savings : undefined,
      };
      setCalculatedTrip(newTrip);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTrip = async () => {
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
      await reloadTrips();
      setCalculatedTrip(null);
      setFrom('');
      setTo('');
      setDistance(0);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTrip = async (id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    if (user) await deleteCarbonTrip(user.uid, id).catch(() => {});
  };

  const totalCO2Saved = trips.reduce((acc, curr) => acc + (curr.savings || 0), 0);

  return {
    from,
    setFrom,
    to,
    setTo,
    distance,
    setDistance,
    selectedMode,
    setSelectedMode,
    trips,
    calculatedTrip,
    setCalculatedTrip,
    loading,
    saving,
    error,
    usingEstimate,
    handleCalculate,
    handleSaveTrip,
    handleDeleteTrip,
    totalCO2Saved,
  };
}
