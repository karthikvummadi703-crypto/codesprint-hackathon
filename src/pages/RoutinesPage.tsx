/**
 * Routines route for AQI-aware daily actions and household settings.
 */
import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import { Badge, getAQIBadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import RoutineCards from './routines/RoutineCards';
import HouseholdCard from './routines/HouseholdCard';
import CommunityWatchCard from './routines/CommunityWatchCard';
import { useRoutines } from './routines/useRoutines';

export default function RoutinesPage() {
  const {
    location,
    aqi,
    status,
    household,
    setHousehold,
    places,
    setPlaces,
    placeAqi,
    memberName,
    setMemberName,
    memberKind,
    setMemberKind,
    placeQuery,
    setPlaceQuery,
    suggestions,
    saving,
    saved,
    error,
    winter,
    sensitive,
    grouped,
    routineCount,
    handleSave,
    handleAddMember,
    handleAddPlace,
  } = useRoutines();

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Daily Routines for Your Household</h1>
            <p className="text-xs text-slate-500 mt-1">
              Practical, low-emission routines tailored to your air and the people you care for.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={winter ? 'warning' : 'success'} className="h-7">
              {winter ? 'Winter smog season' : 'Outside winter smog season'}
            </Badge>
            {status && (
              <Badge variant={getAQIBadgeVariant(status)} className="h-7">
                AQI {aqi}
              </Badge>
            )}
            {saved && (
              <Badge variant="success" className="h-7">
                <Check className="h-3.5 w-3.5 mr-1" /> Saved
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-6">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-5 w-5 text-brand-600" /> Today&apos;s plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aqi === null ? (
                  <p className="text-sm text-slate-500">
                    No live reading is available for {location?.name}. General, season-aware habits are shown
                    below; open the Dashboard to fetch a current reading for tighter timing advice.
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">
                    Based on AQI <strong>{aqi}</strong> ({status ?? 'unknown'}) in {location?.name}
                    {sensitive ? ', with sensitive household members in mind' : ''}.
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Each suggestion states the direct impact of the choice. These are practical habits, not a
                  substitute for medical advice or an indoor-air measurement.
                </p>
              </CardContent>
            </Card>

            <RoutineCards grouped={grouped} />
          </div>

          <div className="space-y-6">
            <HouseholdCard
              household={household}
              sensitive={sensitive}
              memberName={memberName}
              memberKind={memberKind}
              setHousehold={setHousehold}
              setMemberName={setMemberName}
              setMemberKind={setMemberKind}
              onAddMember={handleAddMember}
            />

            <CommunityWatchCard
              places={places}
              placeAqi={placeAqi}
              placeQuery={placeQuery}
              suggestions={suggestions}
              setPlaces={setPlaces}
              setPlaceQuery={setPlaceQuery}
              onAddPlace={handleAddPlace}
            />

            <Button onClick={handleSave} loading={saving} className="w-full">
              Save household &amp; community watch
            </Button>
            <p className="text-[11px] text-slate-400 leading-relaxed" role="status">
              {routineCount} routines are available to the AI assistant when you ask about daily habits.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
