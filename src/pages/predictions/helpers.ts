/** Activity guidance derived from the worst point in the window, not from now. */
export function activityGuidance(peak: number): { title: string; body: string; tone: string } {
  if (peak <= 50) {
    return {
      title: 'Good conditions for outdoor activity',
      body: 'Air quality stays in the healthy range across the whole window. Normal outdoor plans are fine.',
      tone: 'text-emerald-700',
    };
  }
  if (peak <= 100) {
    return {
      title: 'Generally acceptable for most people',
      body: 'Sensitive individuals may notice symptoms during the worst part of the window. Consider reducing prolonged exertion if you are asthmatic.',
      tone: 'text-amber-700',
    };
  }
  if (peak <= 150) {
    return {
      title: 'Sensitive groups should limit exertion',
      body: 'Children, older adults, and anyone with heart or lung conditions should shorten outdoor sessions and take breaks indoors.',
      tone: 'text-orange-700',
    };
  }
  if (peak <= 200) {
    return {
      title: 'Unhealthy — reduce outdoor activity',
      body: 'Everyone should cut back on prolonged outdoor exertion. Reschedule outdoor exercise if you can.',
      tone: 'text-red-700',
    };
  }
  return {
    title: 'Very unhealthy — avoid outdoor exertion',
    body: 'Keep outdoor activity to a minimum. Stay indoors with windows closed and run an air cleaner if you have one.',
    tone: 'text-purple-700',
  };
}

export function windDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function hourLabel(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts.slice(11, 16);
  }
}
