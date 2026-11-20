function windDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function uvLabel(uv: number): string {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function uvColor(uv: number): string {
  if (uv <= 2) return 'bg-emerald-100 text-emerald-800';
  if (uv <= 5) return 'bg-yellow-100 text-yellow-800';
  if (uv <= 7) return 'bg-orange-100 text-orange-800';
  if (uv <= 10) return 'bg-red-100 text-red-800';
  return 'bg-purple-100 text-purple-800';
}

function dayName(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function hourLabel(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts.slice(11, 16);
  }
}

export { windDeg, uvLabel, uvColor, dayName, hourLabel };
