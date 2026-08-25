import React, { useState, useCallback, useEffect } from 'react';
import { MapPin, Navigation, Search, RefreshCw, AlertCircle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AQIGauge from '../components/aqi/AQIGauge';
import PollutantCard from '../components/aqi/PollutantCard';
import HealthAdvisory from '../components/aqi/HealthAdvisory';
import PollutionMap from '../components/aqi/PollutionMap';
import AQITrendChart from '../components/charts/AQITrendChart';
import PollutantTrendChart from '../components/charts/PollutantTrendChart';
import { MOCK_AIR_QUALITY, MOCK_HISTORICAL } from '../services/mockAirQualityService';
import { fetchAQI, searchLocations, reverseGeocode, PlaceSuggestion } from '../services/backendService';
import { useAuth } from '../context/AuthContext';
import { addAirQualityRecord, listAirQualityRecords } from '../services/dataService';
import { AirQualityData, HistoricalDataPoint } from '../types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(MOCK_AIR_QUALITY.location.name);
  const [aqiData, setAqiData] = useState<AirQualityData>(MOCK_AIR_QUALITY);
  const [history, setHistory] = useState<HistoricalDataPoint[]>(MOCK_HISTORICAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usingMock, setUsingMock] = useState(false);

  const loadFromBackend = useCallback(
    async (params: { lat?: number; lon?: number; city?: string }, locationLabel: string) => {
      setLoading(true);
      setError('');
      setShowSuggestions(false);
      try {
        const data = await fetchAQI(params);
        const aq: AirQualityData = {
          aqi: Number(data.aqi),
          status: data.status,
          dominantPollutant: data.dominantPollutant,
          healthAdvisory: data.healthAdvisory,
          location: {
            name: data.location?.name || locationLabel,
            latitude: Number(data.location?.latitude ?? params.lat ?? 0),
            longitude: Number(data.location?.longitude ?? params.lon ?? 0),
            region: data.location?.region,
            country: data.location?.country,
          },
          pollutants: Array.isArray(data.pollutants) ? data.pollutants : [],
          timestamp: data.timestamp || new Date().toISOString(),
          change24h: Number(data.change24h ?? 0),
        };
        setAqiData(aq);
        setCurrentLocation(aq.location.name);
        setUsingMock(data.source === 'mock');
        if (Array.isArray(data.historical) && data.historical.length > 0) {
          setHistory(data.historical);
        }
        if (user) {
          addAirQualityRecord(user.uid, {
            aqi: aq.aqi,
            status: aq.status,
            dominantPollutant: aq.dominantPollutant,
            location: aq.location.name,
            lat: aq.location.latitude,
            lon: aq.location.longitude,
            timestamp: aq.timestamp,
          }).catch(() => {});
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setAqiData((prev) => ({ ...prev, location: { ...prev.location, name: locationLabel } }));
        setCurrentLocation(locationLabel);
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (user) {
      listAirQualityRecords(user.uid, 1)
        .then((records) => {
          const last = records[0];
          if (last?.location && last?.timestamp) {
            const age = Date.now() - new Date(last.timestamp).getTime();
            if (age < 30 * 60 * 1000) {
              loadFromBackend({ city: last.location }, last.location).catch(() => {});
              return;
            }
          }
          loadFromBackend({ city: 'Gudur' }, 'Gudur, Andhra Pradesh').catch(() => {});
        })
        .catch(() => loadFromBackend({ city: 'Gudur' }, 'Gudur, Andhra Pradesh').catch(() => {}));
    } else {
      loadFromBackend({ city: 'Gudur' }, 'Gudur, Andhra Pradesh').catch(() => {});
    }
  }, [loadFromBackend, user]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchLocations(q, 5)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    const best = suggestions[0];
    if (best?.latitude) {
      loadFromBackend({ lat: best.latitude, lon: best.longitude }, best.name);
    } else {
      loadFromBackend({ city: q }, q);
    }
  };

  const selectSuggestion = (s: PlaceSuggestion) => {
    setSearchQuery(s.label || s.name);
    setShowSuggestions(false);
    loadFromBackend({ lat: s.latitude, lon: s.longitude }, s.name);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label = 'My Location';
        try {
          const place = await reverseGeocode(latitude, longitude);
          label = [place.name, place.region, place.country].filter(Boolean).join(', ') || 'My Location';
        } catch {
          // keep generic label if reverse geocoding fails
        }
        loadFromBackend({ lat: latitude, lon: longitude }, label);
      },
      (err) => {
        setLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable location access or search manually.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Location unavailable. Please search for a city instead.'
              : 'Unable to fetch your location. Please try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Top navbar-style header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Urban Air Quality Intelligence</h1>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
              <MapPin className="h-3.5 w-3.5 text-brand-600" />
              <span className="font-medium text-slate-700">{currentLocation}</span>
              {usingMock && (
                <Badge variant="warning" className="ml-2 text-[10px]">Mock data</Badge>
              )}
            </div>
          </div>

          <form onSubmit={handleLocationSearch} className="flex gap-2 w-full md:max-w-md relative">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search city or location..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="pl-9 h-10 border-slate-200"
              />
              {showSuggestions && (searching || suggestions.length > 0) && (
                <ul className="absolute top-11 left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {searching && suggestions.length === 0 && (
                    <li className="px-4 py-3 text-xs text-slate-400">Searching locations...</li>
                  )}
                  {suggestions.map((s, i) => (
                    <li key={`${s.latitude}-${s.longitude}-${i}`}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-start gap-2"
                      >
                        <MapPin className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800 truncate">{s.name}</span>
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
              onClick={handleUseMyLocation}
              title="Use my location"
            >
              <Navigation className="h-4 w-4 text-brand-700" />
            </Button>
          </form>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Could not load air quality data</p>
              <p className="text-xs mt-1">{error}</p>
              <p className="text-xs mt-1">Make sure the backend is running (uvicorn main:app --reload --port 8001).</p>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => loadFromBackend({ city: 'Gudur' }, 'Gudur, Andhra Pradesh')}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
            </Button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        {/* Main AQI Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* AQI Overview Card (Gauge) */}
          <Card className="lg:col-span-4 h-full flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Air Quality Index</CardTitle>
              {loading && <RefreshCw className="h-4 w-4 text-brand-500 animate-spin" />}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center py-6">
              <AQIGauge aqi={aqiData.aqi} />

              <div className="text-center mt-4">
                <Badge variant={aqiData.aqi > 100 ? 'warning' : 'success'} className="mb-2">
                  {aqiData.status}
                </Badge>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 justify-center">
                  <span>Dominant Pollutant: <strong>{aqiData.dominantPollutant}</strong></span>
                  <span className="text-red-500 font-semibold flex items-center gap-0.5">
                    <ArrowUpRight className="h-3 w-3" />+{aqiData.change24h} (24h)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Health Advisory card */}
          <div className="lg:col-span-8 h-full flex flex-col gap-6">
            <HealthAdvisory
              status={aqiData.status}
              advisory={aqiData.healthAdvisory}
              aqi={aqiData.aqi}
            />

            {/* Environmental Insight Card */}
            <Card className="bg-brand-50 border-brand-100 flex-1">
              <CardContent className="flex items-start gap-4">
                <div className="p-3 bg-brand-100 rounded-xl text-brand-700 mt-1">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-brand-900 text-sm">Environmental Insight</h4>
                  <p className="text-xs text-brand-700 leading-relaxed mt-1">
                    Current AQI ({aqiData.aqi}) is primarily driven by {aqiData.dominantPollutant}.{' '}
                    {aqiData.aqi > 100
                      ? 'Sensitive groups should reduce prolonged outdoor exertion. Wearing a mask is recommended during your commute.'
                      : 'Air quality is within acceptable limits for most people.'}{' '}
                    Airflow patterns in the coming hours will influence how levels evolve — check Predictions for the 24-hour outlook.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pollutants Grid */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4">Pollutant Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {aqiData.pollutants.map((pollutant) => (
              <PollutantCard key={pollutant.id} pollutant={pollutant} />
            ))}
          </div>
        </div>

        {/* Charts & Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <AQITrendChart data={history} />
            <PollutantTrendChart data={history} />
          </div>
          <div className="lg:col-span-4 h-full">
            <PollutionMap location={aqiData.location} aqi={aqiData.aqi} />
          </div>
        </div>
      </div>
    </div>
  );
}
