import { MapPin, Navigation, Search } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ActiveLocation } from '../../../context/LocationContext';
import type { DashboardController } from '../hooks/useDashboardController';

interface DashboardHeaderProps {
  controller: DashboardController;
  activeLocation: ActiveLocation;
}

export default function DashboardHeader({ controller, activeLocation }: DashboardHeaderProps) {
  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Urban Air Quality Intelligence</h1>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
            <MapPin className="h-3.5 w-3.5 text-brand-600" />
            <span className="font-medium text-slate-700">
              {controller.currentLocation || activeLocation.name}
            </span>
            {controller.isEstimated && (
              <Badge
                variant="warning"
                className="ml-2 text-[10px]"
                title="Derived from weather, not a measurement"
              >
                Modelled
              </Badge>
            )}
          </div>
        </div>

        <form
          onSubmit={controller.handleLocationSearch}
          className="flex gap-2 w-full md:max-w-md relative"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              role="combobox"
              aria-label="Search city or location"
              aria-expanded={
                controller.showSuggestions &&
                (controller.searching || controller.suggestions.length > 0)
              }
              aria-controls="dashboard-location-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={
                controller.activeSuggestion >= 0
                  ? `dashboard-location-option-${controller.activeSuggestion}`
                  : undefined
              }
              placeholder="Search city or location..."
              value={controller.searchQuery}
              onChange={controller.handleSearchChange}
              onKeyDown={controller.handleSearchKeyDown}
              onFocus={controller.handleSearchFocus}
              onBlur={controller.handleSearchBlur}
              className="pl-9 h-10 border-slate-200"
            />
            {controller.showSuggestions &&
              (controller.searching || controller.suggestions.length > 0) && (
                <ul
                  id="dashboard-location-suggestions"
                  role="listbox"
                  aria-label="Location suggestions"
                  className="absolute top-11 left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
                >
                  {controller.searching && controller.suggestions.length === 0 && (
                    <li className="px-4 py-3 text-xs text-slate-400">Searching locations...</li>
                  )}
                  {controller.suggestions.map((s, i) => (
                    <li key={`${s.latitude}-${s.longitude}-${i}`} role="presentation">
                      <button
                        id={`dashboard-location-option-${i}`}
                        type="button"
                        role="option"
                        aria-selected={i === controller.activeSuggestion}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => controller.selectSuggestion(s)}
                        className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-start gap-2 ${
                          i === controller.activeSuggestion ? 'bg-brand-50' : ''
                        }`}
                      >
                        <MapPin
                          className="h-4 w-4 text-brand-600 mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800 truncate">
                            {s.name}
                          </span>
                          <span className="block text-xs text-slate-400 truncate">
                            {[s.region, s.country].filter(Boolean).join(', ') || s.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <Button type="submit" variant="outline" size="sm" className="h-10 px-4">
            Search
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 px-3 shrink-0"
            onClick={controller.handleUseMyLocation}
            title="Use my location"
            aria-label="Use my location"
          >
            <Navigation className="h-4 w-4 text-brand-700" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </div>
  );
}
