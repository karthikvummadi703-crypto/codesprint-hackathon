import { useEffect, useState } from 'react';
import { estimateDistance } from '../../services/backendService';
import { TravelMode } from '../../types';

export function useTripForm() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [distance, setDistance] = useState<number>(0);
  const [selectedMode, setSelectedMode] = useState<TravelMode>('Car');

  useEffect(() => {
    if (!from.trim() || !to.trim()) return;
    const timer = setTimeout(() => {
      estimateDistance({ origin: from.trim(), destination: to.trim() })
        .then(result => {
          if (result.distanceKm > 0) {
            setDistance(result.distanceKm);
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [from, to]);

  const resetForm = () => {
    setFrom('');
    setTo('');
    setDistance(0);
  };

  return {
    from,
    setFrom,
    to,
    setTo,
    distance,
    setDistance,
    selectedMode,
    setSelectedMode,
    resetForm,
  };
}

export type TripFormController = ReturnType<typeof useTripForm>;
