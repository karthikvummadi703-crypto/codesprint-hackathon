import { useState } from 'react';
import type { ActiveLocation } from '../../context/LocationContext';
import { reverseGeocode } from '../../services/backendService';
import { fallbackLocation, geocodedLocation } from './locationPickerUtils';
import type { GeolocationState } from './types';

export function useGeolocation(
  setQuery: (value: string) => void,
  commit: (loc: ActiveLocation) => void,
): GeolocationState {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const handleSuccess = async (pos: GeolocationPosition) => {
    try {
      const { latitude, longitude } = pos.coords;
      const place = await reverseGeocode(latitude, longitude);
      const loc = geocodedLocation(latitude, longitude, place);
      setQuery(loc.name);
      commit(loc);
    } catch {
      const loc = fallbackLocation(pos.coords);
      commit(loc);
    } finally {
      setLocating(false);
    }
  };

  const handleError = (e: GeolocationPositionError) => {
    setLocating(false);
    setError(
      e.code === e.PERMISSION_DENIED
        ? 'Location permission was denied. Search for a city instead.'
        : 'Could not determine your location. Search for a city instead.',
    );
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, { timeout: 10000 });
  };

  return { locating, error, useMyLocation };
}
