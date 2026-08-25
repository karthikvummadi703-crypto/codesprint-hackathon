import React from 'react';
import { cn } from './Button';
import { AQIStatus } from '../../types';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'purple' | 'blue';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800',
  blue: 'bg-blue-100 text-blue-800',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}

export function getAQIBadgeVariant(status: AQIStatus): BadgeVariant {
  const map: Record<AQIStatus, BadgeVariant> = {
    Good: 'success',
    Moderate: 'warning',
    'Unhealthy for Sensitive Groups': 'warning',
    Unhealthy: 'danger',
    'Very Unhealthy': 'purple',
    Hazardous: 'danger',
  };
  return map[status];
}

export function getAQIColor(aqi: number): string {
  if (aqi <= 50) return '#10B981';
  if (aqi <= 100) return '#F59E0B';
  if (aqi <= 150) return '#F97316';
  if (aqi <= 200) return '#EF4444';
  if (aqi <= 300) return '#8B5CF6';
  return '#991B1B';
}

export function getAQITextColor(aqi: number): string {
  if (aqi <= 50) return 'text-emerald-600';
  if (aqi <= 100) return 'text-amber-600';
  if (aqi <= 150) return 'text-orange-600';
  if (aqi <= 200) return 'text-red-600';
  if (aqi <= 300) return 'text-purple-600';
  return 'text-red-900';
}
