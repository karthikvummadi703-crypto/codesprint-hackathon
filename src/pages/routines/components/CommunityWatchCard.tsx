import { MapPin, Search, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import type { PlaceSuggestion } from '../../../services/backendService';
import type { CommunityPlace } from '../../../types';

interface CommunityWatchCardProps {
  places: CommunityPlace[];
  placeAqi: Record<string, number | null>;
  placeQuery: string;
  suggestions: PlaceSuggestion[];
  onPlaceQueryChange: (value: string) => void;
  onAddPlace: (place: PlaceSuggestion) => void;
  onRemovePlace: (id: string) => void;
}

function PlaceSearch({
  placeQuery,
  suggestions,
  onPlaceQueryChange,
  onAddPlace,
}: Pick<
  CommunityWatchCardProps,
  'placeQuery' | 'suggestions' | 'onPlaceQueryChange' | 'onAddPlace'
>) {
  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
        aria-hidden="true"
      />
      <Input
        type="search"
        role="combobox"
        aria-label="Search a community place"
        aria-expanded={suggestions.length > 0}
        aria-controls="community-place-suggestions"
        aria-autocomplete="list"
        value={placeQuery}
        onChange={e => onPlaceQueryChange(e.target.value)}
        placeholder="Search a place..."
        className="pl-9"
      />
      {suggestions.length > 0 && (
        <ul
          id="community-place-suggestions"
          role="listbox"
          aria-label="Community place suggestions"
          className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {suggestions.map(s => (
            <li key={`${s.name}-${s.latitude}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onAddPlace(s)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                {s.label || s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedPlaceRow({
  place,
  aqi,
  onRemove,
}: {
  place: CommunityPlace;
  aqi: number | null | undefined;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-700">{place.label || place.name}</p>
        <p className="text-[11px] text-slate-400">
          {aqi != null ? `AQI ${aqi}` : 'Reading unavailable'}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${place.name} from community watch`}
        onClick={() => onRemove(place.id)}
        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function CommunityWatchCard({
  places,
  placeAqi,
  placeQuery,
  suggestions,
  onPlaceQueryChange,
  onAddPlace,
  onRemovePlace,
}: CommunityWatchCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-5 w-5 text-brand-600" aria-hidden="true" /> Community watch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Save places your family or community cares about — school, a relative&apos;s home, a
          workplace — and see their current air quality at a glance.
        </p>
        <PlaceSearch
          placeQuery={placeQuery}
          suggestions={suggestions}
          onPlaceQueryChange={onPlaceQueryChange}
          onAddPlace={onAddPlace}
        />
        <ul className="space-y-2">
          {places.map(place => (
            <SavedPlaceRow
              key={place.id}
              place={place}
              aqi={placeAqi[place.id]}
              onRemove={onRemovePlace}
            />
          ))}
        </ul>
        {places.length === 0 && <p className="text-xs text-slate-400">No places saved yet.</p>}
      </CardContent>
    </Card>
  );
}
