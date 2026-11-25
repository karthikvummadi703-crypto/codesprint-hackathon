/**
 * Routine suggestions and household carbon calculations derived from AQI,
 * location, and persisted lifestyle settings.
 */
import { AQIStatus, DailyRoutine, HouseholdMember, HouseholdProfile } from '../types';
import { calculateCO2 } from './carbonConstants';

export interface RoutineContext {
  aqi: number | null;
  status: AQIStatus | null;
  household: HouseholdProfile | null;
  weather?: {
    temperature?: number | null;
    humidity?: number | null;
    windSpeed?: number | null;
    precipitationProbability?: number | null;
  } | null;
  now?: Date;
}

const SEVERITY: Record<AQIStatus, number> = {
  Good: 0,
  Moderate: 1,
  'Unhealthy for Sensitive Groups': 2,
  Unhealthy: 3,
  'Very Unhealthy': 4,
  Hazardous: 5,
};

/** Northern-hemisphere heating/smog season (November through February). */
export function isWinterSmogSeason(now: Date = new Date()): boolean {
  const month = now.getMonth() + 1;
  return month === 11 || month === 12 || month <= 2;
}

export function hasSensitiveMembers(household: HouseholdProfile | null): boolean {
  return Boolean(
    household?.members.some((m) => m.kind === 'child' || m.kind === 'senior' || m.kind === 'respiratory'),
  );
}

const MEMBER_LABELS: Record<HouseholdMember['kind'], string> = {
  adult: 'adult',
  child: 'child',
  senior: 'older adult',
  respiratory: 'member with a breathing condition',
};

export function describeHousehold(household: HouseholdProfile | null): string {
  const members = household?.members ?? [];
  if (members.length === 0) return 'No household members recorded yet.';
  return members.map((m) => `${m.name} (${MEMBER_LABELS[m.kind]})`).join(', ');
}

/**
 * Rule-based daily guidance. Every entry states *why* it helps, so the user can
 * see the direct impact of a choice. Nothing here is a medical diagnosis or a
 * claim of a measured indoor concentration — it is practical, source-aware advice.
 */
export function buildDailyRoutines(context: RoutineContext): DailyRoutine[] {
  const { aqi, status, household, weather } = context;
  const now = context.now ?? new Date();
  const winter = isWinterSmogSeason(now);
  const sensitive = hasSensitiveMembers(household);
  const severe = status ? SEVERITY[status] >= 2 : (aqi ?? 0) > 100;
  const verySevere = status ? SEVERITY[status] >= 3 : (aqi ?? 0) > 150;
  const stillAir = weather?.windSpeed != null && weather.windSpeed < 6;
  const cold = weather?.temperature != null && weather.temperature < 12;

  const routines: DailyRoutine[] = [];

  routines.push({
    id: 'indoor-windows',
    title: 'Time your window opening',
    category: 'indoor-air',
    detail: severe
      ? 'Keep windows closed during rush hours and open them briefly only when outdoor air is cleaner.'
      : 'Air the home for 5–10 minutes in the early morning, away from traffic peaks.',
    impact:
      'Reduces the amount of outdoor PM2.5 that settles indoors, without eliminating useful ventilation.',
    priority: severe ? 'high' : 'medium',
  });

  routines.push({
    id: 'indoor-filter',
    title: 'Run a clean-air device in the main room',
    category: 'indoor-air',
    detail:
      'Use a HEPA purifier sized for the room, or a DIY box-fan filter, and replace filters on schedule.',
    impact:
      'A correctly sized HEPA filter removes most fine particles from the room air you breathe for hours.',
    priority: severe || sensitive ? 'high' : 'medium',
  });

  routines.push({
    id: 'indoor-cooking',
    title: 'Ventilate cooking without pulling in smog',
    category: 'indoor-air',
    detail: 'Use a range hood vented outdoors, cook on lower heat, and avoid frying during pollution peaks.',
    impact:
      'Cooking is a major indoor particle source; capturing it at the source avoids adding to outdoor pollution.',
    priority: 'medium',
  });

  if (weather?.humidity != null && weather.humidity > 60) {
    routines.push({
      id: 'indoor-humidity',
      title: 'Keep indoor humidity near 40–60%',
      category: 'indoor-air',
      detail: 'Use a dehumidifier or exhaust fan after bathing and drying clothes indoors.',
      impact: 'Limits mould and dust-mite growth, which otherwise aggravate breathing symptoms.',
      priority: 'medium',
    });
  }

  const shortTripKm = 3;
  const avoided = calculateCO2(shortTripKm, 'Car');
  routines.push({
    id: 'low-emission-short-trips',
    title: 'Walk or cycle short local trips',
    category: 'low-emission',
    detail: `Replace one ${shortTripKm} km car trip with walking or cycling when AQI allows.`,
    impact: `Avoids about ${avoided.toFixed(2)} kg CO2e and the local NO₂ and particle emissions from that trip.`,
    priority: severe ? 'low' : 'high',
  });

  routines.push({
    id: 'low-emission-peak',
    title: 'Shift errands away from traffic peaks',
    category: 'low-emission',
    detail: 'Combine errands into one trip and travel after rush hour where possible.',
    impact:
      'Fewer cold starts and less time idling means lower tailpipe emissions in your own neighbourhood.',
    priority: 'medium',
  });

  routines.push({
    id: 'low-emission-home',
    title: 'Lower heating demand by 1–2°C',
    category: 'low-emission',
    detail: 'Layer clothing, close curtains at dusk, and set the thermostat slightly lower.',
    impact: `Cuts household energy use; every avoided kWh reduces the emissions from power generation.`,
    priority: winter ? 'high' : 'medium',
  });

  if (severe || verySevere) {
    routines.push({
      id: 'outdoor-timing',
      title: 'Move strenuous activity indoors',
      category: 'outdoor-timing',
      detail: 'Reschedule outdoor exercise to a cleaner part of the day or choose an indoor session.',
      impact: 'Lower exertion means a smaller inhaled dose of fine particles during the worst hours.',
      priority: 'high',
    });
  } else {
    routines.push({
      id: 'outdoor-timing',
      title: 'Choose a cleaner exercise window',
      category: 'outdoor-timing',
      detail: 'Check the hourly outlook before heading out; windier or post-rain hours are usually cleaner.',
      impact: 'Keeps the health benefits of outdoor activity while reducing particle exposure.',
      priority: 'low',
    });
  }

  if (winter) {
    routines.push({
      id: 'winter-solid-fuel',
      title: 'Avoid solid-fuel burning on still days',
      category: 'winter-smog',
      detail:
        'Do not burn wood or coal when wind is weak, and service the heating system before the cold spell.',
      impact:
        'Residential burning is a major winter PM2.5 source; avoiding it protects your own street as well as your home.',
      priority: stillAir || verySevere ? 'high' : 'medium',
    });
    routines.push({
      id: 'winter-mask',
      title: 'Carry a well-fitting mask for unavoidable outdoor time',
      category: 'winter-smog',
      detail: 'Use a properly fitted FFP2/N95 mask on severe smog days, especially for commute and queues.',
      impact: 'A good seal reduces inhaled particles; a loose cloth mask provides far less protection.',
      priority: verySevere ? 'high' : 'medium',
    });
  }

  if (cold && sensitive) {
    routines.push({
      id: 'winter-warm-air',
      title: 'Keep warm without dry indoor air',
      category: 'winter-smog',
      detail: 'Heat the room you use most and keep humidity in range rather than overheating the whole home.',
      impact:
        'Warm, conditioned air reduces cold-air triggers for breathing conditions while limiting energy use.',
      priority: 'medium',
    });
  }

  if (sensitive) {
    routines.push({
      id: 'household-check',
      title: 'Check in with sensitive household members',
      category: 'household',
      detail:
        'Ask about symptoms, keep medication and a mask ready, and shorten exertion for those affected.',
      impact:
        'Children, older adults and people with breathing conditions feel particle exposure first; early action prevents escalation.',
      priority: 'high',
    });
  }

  routines.push({
    id: 'household-plan',
    title: 'Agree a shared household plan',
    category: 'household',
    detail: 'Tell everyone where the purifier, masks and medication are and what to do on a severe-smog day.',
    impact: 'A known plan removes delays when outdoor air suddenly deteriorates.',
    priority: 'medium',
  });

  const order = { high: 0, medium: 1, low: 2 };
  return routines.sort((a, b) => order[a.priority] - order[b.priority]);
}

export function routinesToPromptContext(
  routines: DailyRoutine[],
  household: HouseholdProfile | null,
): string {
  if (routines.length === 0 && !household) return '';
  const lines = [
    'Household and daily routine context (user-provided; not measured):',
    `Household: ${describeHousehold(household)}`,
    ...routines.map((r) => `- ${r.title} [${r.category}, ${r.priority}]: ${r.detail} Impact: ${r.impact}`),
  ];
  return lines.join('\n');
}
