import { HouseholdMemberKind, RoutineCategory } from '../../types';

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
