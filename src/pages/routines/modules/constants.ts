import type { DailyRoutine, HouseholdMemberKind, RoutineCategory } from '../../../types';

export const CATEGORY_LABELS: Record<RoutineCategory, string> = {
  'indoor-air': 'Indoor air quality',
  'low-emission': 'Low-emission routines',
  'outdoor-timing': 'Timing outdoors',
  'winter-smog': 'Winter smog',
  household: 'Household & community',
};

export const MEMBER_KINDS: { value: HouseholdMemberKind; label: string }[] = [
  { value: 'adult', label: 'Adult' },
  { value: 'child', label: 'Child' },
  { value: 'senior', label: 'Older adult' },
  { value: 'respiratory', label: 'Breathing condition' },
];

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function groupRoutines(routines: DailyRoutine[]): [RoutineCategory, DailyRoutine[]][] {
  const map = new Map<RoutineCategory, DailyRoutine[]>();
  for (const routine of routines) {
    const list = map.get(routine.category) ?? [];
    list.push(routine);
    map.set(routine.category, list);
  }
  return Array.from(map.entries());
}
