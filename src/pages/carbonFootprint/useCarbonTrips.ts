import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { deleteCarbonTrip, listCarbonTrips } from '../../services/dataService';
import { CarbonTrip } from '../../types';
import { toCarbonTrip } from './tripUtils';

export function useCarbonTrips() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<CarbonTrip[]>([]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial trip load must stay in the effect to preserve mount timing.
    reloadTrips();
  }, [reloadTrips]);

  const handleDeleteTrip = async (id: string) => {
    setTrips(prev => prev.filter(t => t.id !== id));
    if (user) await deleteCarbonTrip(user.uid, id).catch(() => {});
  };

  const totalCO2Saved = trips.reduce((acc, curr) => acc + (curr.savings || 0), 0);

  return { trips, reloadTrips, handleDeleteTrip, totalCO2Saved };
}

export type CarbonTripsController = ReturnType<typeof useCarbonTrips>;
