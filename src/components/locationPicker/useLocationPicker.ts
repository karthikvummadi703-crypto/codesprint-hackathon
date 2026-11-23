import { useLocation } from '../../context/LocationContext';
import type { ActiveLocation } from '../../context/LocationContext';
import { useGeolocation } from './useGeolocation';
import { useLocationSearch } from './useLocationSearch';
import type { LocationPickerController } from './types';

export function useLocationPicker(
  onPicked?: (loc: ActiveLocation) => void,
): LocationPickerController {
  const { setLocation } = useLocation();
  const commit = (loc: ActiveLocation) => {
    setLocation(loc);
    onPicked?.(loc);
  };
  const search = useLocationSearch(commit);
  const geo = useGeolocation(search.setQuery, commit);

  return { ...search, ...geo };
}
