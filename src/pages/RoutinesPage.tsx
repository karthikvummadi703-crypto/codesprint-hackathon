import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CloudFog,
  Home,
  Leaf,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Badge, getAQIBadgeVariant } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useLocation, toLocationParams } from '../context/LocationContext';
import { fetchAQI, searchLocations, PlaceSuggestion } from '../services/backendService';
import { getLifestyleSettings, saveLifestyleSettings } from '../services/dataService';
import {
  buildDailyRoutines,
  describeHousehold,
  hasSensitiveMembers,
  isWinterSmogSeason,
  routinesToPromptContext,
} from '../services/lifestyleService';
import {
  AQIStatus,
  CommunityPlace,
  DailyRoutine,
  HouseholdMemberKind,
  HouseholdProfile,
  RoutineCategory,
} from '../types';

const CATEGORY_LABELS: Record<RoutineCategory, string> = {
  'indoor-air': 'Indoor air quality',
  'low-emission': 'Low-emission routines',
  'outdoor-timing': 'Timing outdoors',
  'winter-smog': 'Winter smog',
  household: 'Household & community',
};

const MEMBER_KINDS: { value: HouseholdMemberKind; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'child', label: 'Child' },
  { value: 'senior', label: 'Older adult' },
  { value: 'respiratory', label: 'Breathing condition' },
];

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function RoutinesPage() {
  const { user } = useAuth();
  const { location } = useLocation();
  const [aqi, setAqi] = useState<number | null>(null);
  const [status, setStatus] = useState<AQIStatus | null>(null);
  const [household, setHousehold] = useState<HouseholdProfile>({ members: [] });
  const [places, setPlaces] = useState<CommunityPlace[]>([]);
  const [placeAqi, setPlaceAqi] = useState<Record<string, number | null>>({});
  const [memberName, setMemberName] = useState('');
  const [memberKind, setMemberKind] = useState<HouseholdMemberKind>('adult');
  const [placeQuery, setPlaceQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getLifestyleSettings(user.uid)
      .then((data) => {
        if (cancelled || !data) return;
        if (data.household && typeof data.household === 'object') {
          setHousehold(data.household as HouseholdProfile);
        }
        if (Array.isArray(data.communityWatch)) {
          setPlaces(data.communityWatch as CommunityPlace[]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    fetchAQI(toLocationParams(location))
      .then((data) => {
        if (cancelled) return;
        setAqi(typeof data.aqi === 'number' ? data.aqi : Number(data.aqi) || null);
        setStatus((data.status as AQIStatus) ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setAqi(null);
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location]);

  useEffect(() => {
    let cancelled = false;
    if (places.length === 0) {
      setPlaceAqi({});
      return;
    }
    void Promise.all(
      places.map(async (place) => {
        try {
          const data = await fetchAQI({ lat: place.latitude, lon: place.longitude });
          return [place.id, typeof data.aqi === 'number' ? data.aqi : Number(data.aqi) || null] as const;
        } catch {
          return [place.id, null] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setPlaceAqi(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [places]);

  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchLocations(q, 5)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [placeQuery]);

  const winter = isWinterSmogSeason();
  const sensitive = hasSensitiveMembers(household);
  const routines = useMemo(
    () => buildDailyRoutines({ aqi, status, household }),
    [aqi, status, household]
  );
  const grouped = useMemo(() => {
    const map = new Map<RoutineCategory, DailyRoutine[]>();
    for (const routine of routines) {
      const list = map.get(routine.category) ?? [];
      list.push(routine);
      map.set(routine.category, list);
    }
    return Array.from(map.entries());
  }, [routines]);

  const promptContext = useMemo(() => routinesToPromptContext(routines, household), [routines, household]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await saveLifestyleSettings(user.uid, {
        household,
        communityWatch: places,
        routines,
        routinePromptContext: promptContext,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = () => {
    const name = memberName.trim();
    if (!name) return;
    setHousehold((prev) => ({
      ...prev,
      members: [...prev.members, { id: newId('member'), name, kind: memberKind }],
    }));
    setMemberName('');
  };

  const handleAddPlace = (place: PlaceSuggestion) => {
    setPlaces((prev) => [
      ...prev,
      {
        id: newId('place'),
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.label,
      },
    ]);
    setPlaceQuery('');
    setSuggestions([]);
  };

  const routineCount = routines.length;

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
            {status && <Badge variant={getAQIBadgeVariant(status)} className="h-7">AQI {aqi}</Badge>}
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
          <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
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
                    No live reading is available for {location?.name}. General, season-aware habits are shown below;
                    open the Dashboard to fetch a current reading for tighter timing advice.
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">
                    Based on AQI <strong>{aqi}</strong> ({status ?? 'unknown'}) in {location?.name}
                    {sensitive ? ', with sensitive household members in mind' : ''}.
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Each suggestion states the direct impact of the choice. These are practical habits, not a substitute
                  for medical advice or an indoor-air measurement.
                </p>
              </CardContent>
            </Card>

            {grouped.map(([category, items]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {category === 'indoor-air' ? <Home className="h-5 w-5 text-brand-600" /> : null}
                    {category === 'low-emission' ? <Leaf className="h-5 w-5 text-emerald-600" /> : null}
                    {category === 'winter-smog' ? <CloudFog className="h-5 w-5 text-slate-600" /> : null}
                    {category === 'household' ? <Users className="h-5 w-5 text-brand-600" /> : null}
                    {category === 'outdoor-timing' ? <MapPin className="h-5 w-5 text-amber-600" /> : null}
                    {CATEGORY_LABELS[category]}
                    <span className="text-xs font-normal text-slate-400">({items.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((routine) => (
                    <div key={routine.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-800">{routine.title}</h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            routine.priority === 'high'
                              ? 'bg-red-100 text-red-700'
                              : routine.priority === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {routine.priority}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{routine.detail}</p>
                      <p className="text-xs text-brand-700 mt-2 leading-relaxed">
                        <strong>Impact:</strong> {routine.impact}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-5 w-5 text-brand-600" /> Household members
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  {describeHousehold(household)} {sensitive ? 'Your plan includes extra protection for sensitive members.' : ''}
                </p>
                <ul className="space-y-2">
                  {household.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-700">{member.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">{member.kind}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${member.name} from household`}
                          onClick={() =>
                            setHousehold((prev) => ({
                              ...prev,
                              members: prev.members.filter((m) => m.id !== member.id),
                            }))
                          }
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {household.members.length === 0 && (
                  <p className="text-xs text-slate-400">No members yet. Add the people you plan for.</p>
                )}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <Label htmlFor="member-name">Name</Label>
                  <Input
                    id="member-name"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMember();
                      }
                    }}
                    placeholder="e.g. Riya"
                  />
                  <Label htmlFor="member-kind">Needs</Label>
                  <select
                    id="member-kind"
                    value={memberKind}
                    onChange={(e) => setMemberKind(e.target.value as HouseholdMemberKind)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    {MEMBER_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>{kind.label}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddMember}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add member
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-5 w-5 text-brand-600" aria-hidden="true" /> Community watch
                  </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Save places your family or community cares about — school, a relative&apos;s home, a workplace —
                  and see their current air quality at a glance.
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <Input
                    type="search"
                    role="combobox"
                    aria-label="Search a community place"
                    aria-expanded={suggestions.length > 0}
                    aria-controls="community-place-suggestions"
                    aria-autocomplete="list"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
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
                      {suggestions.map((s) => (
                        <li key={`${s.name}-${s.latitude}`} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => handleAddPlace(s)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            {s.label || s.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <ul className="space-y-2">
                  {places.map((place) => (
                    <li key={place.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700">{place.label || place.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {placeAqi[place.id] != null ? `AQI ${placeAqi[place.id]}` : 'Reading unavailable'}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${place.name} from community watch`}
                        onClick={() => setPlaces((prev) => prev.filter((p) => p.id !== place.id))}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                {places.length === 0 && (
                  <p className="text-xs text-slate-400">No places saved yet.</p>
                )}
              </CardContent>
            </Card>

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
