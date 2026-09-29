/**
 * Environmental analysis for the AI assistant page.
 *
 * The rule this module exists to enforce: a value is only ever shown when it
 * was actually measured. Every field is nullable because providers fail, and a
 * missing reading must be reported as missing rather than defaulted to zero,
 * blank or a plausible-looking guess.
 */

export interface PollutantReading {
  id: string;
  name: string;
  value: number | null;
  unit?: string;
}

export interface AirQualityReading {
  aqi?: number | null;
  status?: string | null;
  dominantPollutant?: string | null;
  pollutants?: PollutantReading[];
  source?: string | null;
}

export interface WeatherReading {
  current?: {
    temperature?: number | null;
    humidity?: number | null;
    windSpeed?: number | null;
    windDirection?: number | null;
    precipitationProbability?: number | null;
    uvIndex?: number | null;
    visibility?: number | null;
    condition?: string | null;
  } | null;
}

export interface AdviceInput {
  airQuality?: AirQualityReading | null;
  weather?: WeatherReading | null;
}

export interface Advice {
  headline: string;
  pollutant: string;
  actions: string[];
  notes: string[];
}

/** Only real numbers are formatted; null/undefined/NaN are treated as missing. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dominantPollutant(air: AirQualityReading | null | undefined): PollutantReading | null {
  if (!air?.pollutants?.length) return null;
  const byId = air.dominantPollutant
    ? air.pollutants.find((p) => p.id === air.dominantPollutant)
    : null;
  const candidate = byId ?? air.pollutants[0];
  return num(candidate?.value) === null ? null : candidate;
}

/** Rates outdoor guidance off the official AQI breakpoints. */
function activityLevel(aqi: number): 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'severe' {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'sensitive';
  if (aqi <= 200) return 'unhealthy';
  return 'severe';
}

/**
 * Guidance grows with severity: the more polluted the window, the more the
 * user needs to change. Phrased as general advice about the conditions, never
 * as a diagnosis or a claim about the individual's health.
 */
const ACTIVITY_ADVICE: Record<ReturnType<typeof activityLevel>, string[]> = {
  good: ['Air quality is in the healthy range, so normal outdoor activity is fine.'],
  moderate: [
    'Acceptable for most people; unusually sensitive individuals may notice symptoms.',
    'Anyone managing asthma should keep medication available during longer sessions.',
  ],
  sensitive: [
    'Children, older adults, and anyone with heart or lung conditions should shorten outdoor exertion.',
    'Move intense exercise indoors, or to a quieter time of day.',
    'Consider an indoor filter in rooms that are used for sleeping.',
  ],
  unhealthy: [
    'Everyone should reduce prolonged outdoor exertion.',
    'Reschedule outdoor exercise where possible.',
    'Keep windows closed at peak levels and ventilate when levels drop.',
  ],
  severe: [
    'Keep outdoor activity to a minimum while these levels hold.',
    'Stay indoors with windows closed and run a portable air cleaner if available.',
    'N95-style masks help if a trip outdoors cannot be avoided.',
    'Check on children and older adults during this period.',
  ],
};

const SOURCE_NOTE: Record<string, string> = {
  estimated: 'This figure is a modelled estimate, not a measurement from a monitor.',
  openweather: 'Reported by the OpenWeather air quality feed.',
  'open-meteo': 'Reported by the Open-Meteo air quality feed.',
  google: 'Reported by a Google Air Quality sensor.',
};

export function buildAdvice({ airQuality, weather }: AdviceInput): Advice {
  const aqi = num(airQuality?.aqi);
  const dominant = dominantPollutant(airQuality);

  if (aqi === null) {
    return {
      headline: 'Air quality is unavailable for this location right now.',
      pollutant: 'Pollutant concentrations are unavailable, so no value is shown.',
      actions: [],
      notes: driverNotes({ airQuality, weather }),
    };
  }

  const status = airQuality?.status?.trim() || 'Uncategorised';
  const level = activityLevel(aqi);

  const headline =
    level === 'good' || level === 'moderate'
      ? `Air quality is ${status} (AQI ${aqi}).`
      : `Air quality is ${status} (AQI ${aqi}) — take care outdoors.`;

  const pollutant = dominant
    ? `Main pollutant: ${dominant.name} at ${dominant.value} ${dominant.unit ?? 'µg/m³'}.`
    : 'Pollutant concentration values are unavailable for this reading.';

  const actions = [...ACTIVITY_ADVICE[level]];
  const notes = driverNotes({ airQuality, weather });

  const source = airQuality?.source?.toLowerCase();
  if (source && SOURCE_NOTE[source]) notes.push(SOURCE_NOTE[source]);

  return { headline, pollutant, actions, notes };
}

/**
 * Meteorological explanations, each attached to a real observation.
 * Nothing is produced from missing data, and no claim is made that a
 * particular condition is the sole cause of a pollution level.
 */
export function driverNotes({ airQuality, weather }: AdviceInput): string[] {
  const current = weather?.current ?? null;
  if (!current) return [];

  const notes: string[] = [];

  const wind = num(current.windSpeed);
  if (wind !== null) {
    if (wind < 3) {
      notes.push(
        'Winds are light right now, so pollutants are not being dispersed and can accumulate near the ground.',
      );
    } else if (wind > 15) {
      notes.push('Winds are strong, which helps disperse particulates near the ground.');
    } else {
      notes.push('Winds are moderate, giving partial dispersal of airborne particles.');
    }
  }

  const uv = num(current.uvIndex);
  if (uv !== null && uv >= 6) {
    notes.push(
      'UV levels are high, and strong sunlight drives the daytime chemistry that forms ground-level ozone.',
    );
  }

  const humidity = num(current.humidity);
  if (humidity !== null && humidity >= 80) {
    notes.push('High humidity can support secondary particle formation in moist, still conditions.');
  }

  const rain = num(current.precipitationProbability);
  if (rain !== null && rain >= 60) {
    notes.push(
      'Rain is likely, but rainfall is not a reliable clean-up: wet deposition only removes what is already airborne, and damp surfaces can resuspend particles.',
    );
  }

  const aqi = num(airQuality?.aqi);
  const dominantId = dominantPollutant(airQuality)?.id;
  if (aqi !== null && dominantId === 'pm25' && uv !== null && uv >= 6) {
    notes.push(
      'With PM2.5 dominant, traffic and combustion sources matter more than sunlight-driven chemistry right now.',
    );
  }

  return notes;
}
