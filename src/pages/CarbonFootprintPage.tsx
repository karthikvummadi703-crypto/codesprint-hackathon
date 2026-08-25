import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Leaf, MapPin, Navigation, Info, ShieldCheck, Footprints, Trash2, AlertCircle } from 'lucide-react';
import { calculateCO2, TRAVEL_MODE_ICONS, CO2_FACTORS } from '../services/mockCarbonService';
import { calculateCarbon, estimateDistance } from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import { addCarbonTrip, listCarbonTrips, deleteCarbonTrip } from '../services/dataService';
import { CarbonTrip, TravelMode } from '../types';

const TRAVEL_MODES: TravelMode[] = ['Car', 'Bike', 'Bus', 'Train', 'EV', 'Walking', 'Bicycle'];

function toCarbonTrip(raw: any): CarbonTrip {
  return {
    id: raw.id,
    origin: raw.origin,
    destination: raw.destination,
    distanceKm: Number(raw.distanceKm || 0),
    mode: raw.mode as TravelMode,
    co2eKg: Number(raw.co2eKg || 0),
    date: new Date(raw.date),
    savings: raw.savings !== undefined && raw.savings !== null ? Number(raw.savings) : undefined,
  };
}

export default function CarbonFootprintPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [distance, setDistance] = useState<number>(0);
  const [selectedMode, setSelectedMode] = useState<TravelMode>('Car');
  const [trips, setTrips] = useState<CarbonTrip[]>([]);
  const [calculatedTrip, setCalculatedTrip] = useState<CarbonTrip | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usingEstimate, setUsingEstimate] = useState(false);

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
    reloadTrips();
  }, [reloadTrips]);

  useEffect(() => {
    if (!from.trim() || !to.trim()) return;
    const timer = setTimeout(() => {
      estimateDistance({ origin: from.trim(), destination: to.trim() })
        .then((result) => {
          if (result.distanceKm > 0) {
            setDistance(result.distanceKm);
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [from, to]);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    setLoading(true);
    setError('');
    setUsingEstimate(false);

    try {
      const result = await calculateCarbon({
        origin: from,
        destination: to,
        distanceKm: distance > 0 ? distance : undefined,
        mode: selectedMode,
      });
      const co2e = result.co2eKg;
      const avgCarCo2 = calculateCO2(distance, 'Car');
      const savings = Math.max(0, Math.round((avgCarCo2 - co2e) * 100) / 100);

      const newTrip: CarbonTrip = {
        id: Date.now().toString(),
        origin: from,
        destination: to,
        distanceKm: Number(result.distanceKm || distance),
        mode: selectedMode,
        co2eKg: co2e,
        date: new Date(),
        savings: savings > 0 ? savings : undefined,
      };
      setCalculatedTrip(newTrip);
      setUsingEstimate(Boolean(result.estimated));
    } catch (err) {
      const co2e = calculateCO2(distance, selectedMode);
      const avgCarCo2 = calculateCO2(distance, 'Car');
      const savings = Math.max(0, Math.round((avgCarCo2 - co2e) * 100) / 100);
      const newTrip: CarbonTrip = {
        id: Date.now().toString(),
        origin: from,
        destination: to,
        distanceKm: distance,
        mode: selectedMode,
        co2eKg: co2e,
        date: new Date(),
        savings: savings > 0 ? savings : undefined,
      };
      setCalculatedTrip(newTrip);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!calculatedTrip || !user) return;
    setSaving(true);
    try {
      await addCarbonTrip(user.uid, {
        origin: calculatedTrip.origin,
        destination: calculatedTrip.destination,
        distanceKm: calculatedTrip.distanceKm,
        mode: calculatedTrip.mode,
        co2eKg: calculatedTrip.co2eKg,
        date: calculatedTrip.date.toISOString(),
        savings: calculatedTrip.savings || 0,
      });
      await reloadTrips();
      setCalculatedTrip(null);
      setFrom('');
      setTo('');
      setDistance(0);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTrip = async (id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    if (user) await deleteCarbonTrip(user.uid, id).catch(() => {});
  };

  const totalCO2Saved = trips.reduce((acc, curr) => acc + (curr.savings || 0), 0);
  const totalCO2 = trips.reduce((acc, curr) => acc + (curr.co2eKg || 0), 0);
  const avgCO2 = trips.length > 0 ? totalCO2 / trips.length : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Carbon Footprint Calculator</h1>
            <p className="text-xs text-slate-500 mt-1">Estimate and offset your travel-related carbon emissions</p>
          </div>
          {totalCO2Saved > 0 && (
            <Badge variant="success" className="h-7 text-xs gap-1 shrink-0">
              <Leaf className="h-3.5 w-3.5 fill-current" /> {totalCO2Saved.toFixed(1)} kg CO₂e Saved
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Backend unavailable — used local calculation instead.</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form Card */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle>Travel Calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCalculate} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="from">From (Origin)</Label>
                    <Input
                      id="from"
                      placeholder="e.g. Gudur Station"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="to">To (Destination)</Label>
                    <Input
                      id="to"
                      placeholder="e.g. Nellore Office"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="distance">Distance (km)</Label>
                  <Input
                    id="distance"
                    type="number"
                    step="0.1"
                    placeholder="Leave blank to auto-estimate"
                    value={distance || ''}
                    onChange={(e) => setDistance(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <Label>Mode of Travel</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                    {TRAVEL_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSelectedMode(mode)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-xs font-semibold ${
                          selectedMode === mode
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <span className="text-xl mb-1">{TRAVEL_MODE_ICONS[mode]}</span>
                        <span>{mode}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full h-11" loading={loading}>
                  Calculate Emissions
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Results Card */}
          <div className="lg:col-span-5 space-y-6">
            {calculatedTrip ? (
              <Card className="border-brand-200 bg-brand-50/50 shadow-md">
                <CardHeader>
                  <CardTitle className="text-brand-800 flex items-center gap-2">
                    <Leaf className="h-5 w-5 text-brand-600" /> Emissions Calculated
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Estimated CO2 Impact</div>
                    <div className="text-4xl font-extrabold text-brand-800 mt-1">
                      {calculatedTrip.co2eKg} <span className="text-lg font-normal text-brand-600">kg CO₂e</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-brand-100 pt-4 text-xs text-slate-600">
                    <div>
                      <strong>Distance:</strong> {calculatedTrip.distanceKm} km
                    </div>
                    <div>
                      <strong>Mode:</strong> {TRAVEL_MODE_ICONS[calculatedTrip.mode]} {calculatedTrip.mode}
                    </div>
                  </div>

                  {usingEstimate && (
                    <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600">
                      <strong>Note:</strong> Distance is a straight-line estimate, not exact road distance.
                    </div>
                  )}

                  {calculatedTrip.savings && calculatedTrip.savings > 0 ? (
                    <div className="bg-emerald-100/50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-800">
                      <ShieldCheck className="h-4 w-4 mt-0.5" />
                      <div>
                        <strong>Nice job!</strong> By using {calculatedTrip.mode} instead of a regular car, you saved{' '}
                        <strong>{calculatedTrip.savings} kg CO₂e</strong>.
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <Button onClick={handleSaveTrip} className="flex-1" loading={saving}>
                      Save to Log
                    </Button>
                    <Button variant="outline" onClick={() => setCalculatedTrip(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200/60 bg-white">
                <CardContent className="py-16 text-center space-y-4">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <Footprints className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">No Calculation Active</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Fill out the form on the left to see travel carbon emissions and environmental alternatives.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Environmental alternative reminder */}
            <Card className="bg-brand-50 border-brand-100">
              <CardContent className="flex gap-3 text-xs text-brand-800 leading-relaxed pt-6">
                <Info className="h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <strong>Tip:</strong> Opting for public transport or active travel instead of a personal car cuts
                  your travel footprint by up to <strong>80%</strong>. Your saved trips are synced to your account.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trips table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Trips Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {trips.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Route</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Distance</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mode</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">CO₂e Impact</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Savings</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trips.map((trip) => (
                    <tr key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {trip.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {trip.origin} → {trip.destination}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{trip.distanceKm} km</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {TRAVEL_MODE_ICONS[trip.mode]} {trip.mode}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-950 font-semibold">{trip.co2eKg} kg</td>
                      <td className="px-6 py-4 text-xs">
                        {trip.savings && trip.savings > 0 ? (
                          <Badge variant="success">Saved {trip.savings} kg</Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDeleteTrip(trip.id)}
                          className="text-slate-400 hover:text-red-500 p-1 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-slate-400 py-12 text-sm">No trips saved yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}