import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface ActiveLocation {
  name: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  country?: string;
}

const STORAGE_KEY = 'airguard_active_location';

function loadStored(): ActiveLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string' && parsed.name) return parsed as ActiveLocation;
  } catch {
    // ignore corrupt storage
  }
  return null;
}

/**
 * Build backend query params from an active location.
 *
 * Coordinates are preferred over the name so a resolved place is never
 * re-geocoded to somewhere else. A name-only location is still valid because
 * the backend geocodes it.
 */
export function toLocationParams(loc: ActiveLocation): { lat?: number; lon?: number; city?: string } {
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return { lat: loc.latitude, lon: loc.longitude };
  }
  return { city: loc.name };
}

interface LocationContextValue {
  /** null until the user has chosen a location. Nothing may be fetched before then. */
  location: ActiveLocation | null;
  setLocation: (loc: ActiveLocation) => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

/** True when two locations would produce identical backend requests. */
function isSameLocation(a: ActiveLocation, b: ActiveLocation): boolean {
  return (
    a.name === b.name &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    (a.region ?? '') === (b.region ?? '') &&
    (a.country ?? '') === (b.country ?? '')
  );
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<ActiveLocation | null>(loadStored);

  useEffect(() => {
    try {
      if (location) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
      } else {
        // No location chosen must not survive as a stored one.
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // storage may be unavailable; location still works in-memory
    }
  }, [location]);

  // These must keep a stable identity. Consumers put them in dependency arrays,
  // so recreating them per render would re-run effects that in turn set the
  // location, which is an infinite render loop.
  const setLocation = useCallback((loc: ActiveLocation) => {
    if (!loc || !loc.name) return;
    // Re-pinning the same place is a no-op, so a load that resolves the
    // location it was asked for cannot retrigger itself.
    setLocationState((prev) => (prev && isSameLocation(prev, loc) ? prev : loc));
  }, []);

  const clearLocation = useCallback(() => setLocationState(null), []);

  const value = useMemo<LocationContextValue>(
    () => ({ location, setLocation, clearLocation }),
    [location, setLocation, clearLocation]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
