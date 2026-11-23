import { LocationPickerLayout } from './locationPicker/LocationPickerLayout';
import { LocationSearchForm } from './locationPicker/LocationSearchForm';
import type { LocationPickerProps } from './locationPicker/types';
import { useLocationPicker } from './locationPicker/useLocationPicker';

/**
 * Location chooser.
 *
 * There is deliberately no default location. A first-time visitor outside the
 * project author's city would otherwise see unrelated air quality data with no
 * indication that it was not theirs.
 */
export default function LocationPicker({ compact = false, onPicked }: LocationPickerProps) {
  const controller = useLocationPicker(onPicked);

  return (
    <LocationPickerLayout compact={compact}>
      <LocationSearchForm controller={controller} />
    </LocationPickerLayout>
  );
}
