import React from 'react';
import { getAQIColor } from '../ui/Badge';

interface AQIGaugeProps {
  aqi: number;
  size?: number;
}

export default function AQIGauge({ aqi, size = 200 }: AQIGaugeProps) {
  // SVG arc gauge - semi-circle from 210° to -30° (240° sweep)
  const clampedAqi = Math.min(Math.max(aqi, 0), 500);
  const pct = clampedAqi / 500;
  const sweepDeg = 240;
  const startAngle = 150; // degrees, from 3 o'clock position

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const start = polarToCartesian(cx, cy, r, endDeg);
    const end = polarToCartesian(cx, cy, r, startDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.75;
  const strokeW = (size / 2) * 0.12;

  const bgPath = arcPath(cx, cy, r, startAngle, startAngle + sweepDeg);
  const activeDeg = sweepDeg * pct;
  const fgPath = activeDeg > 0 ? arcPath(cx, cy, r, startAngle, startAngle + activeDeg) : '';

  // Needle
  const needleAngle = startAngle + sweepDeg * pct;
  const needleRad = ((needleAngle - 90) * Math.PI) / 180;
  const needleLen = r * 0.7;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  // AQI scale ticks
  const levels = [
    { label: '0', pct: 0 },
    { label: '50', pct: 0.1 },
    { label: '100', pct: 0.2 },
    { label: '150', pct: 0.3 },
    { label: '200', pct: 0.4 },
    { label: '300', pct: 0.6 },
    { label: '500', pct: 1.0 },
  ];

  const color = getAQIColor(aqi);

  return (
    <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      {/* Background arc */}
      <path
        d={bgPath}
        fill="none"
        stroke="#E2E8F0"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {/* Colored gradient stops */}
      <defs>
        <linearGradient id="aqiGrad" gradientUnits="userSpaceOnUse" x1="0" y1={cy} x2={size} y2={cy}>
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="20%" stopColor="#F59E0B" />
          <stop offset="40%" stopColor="#F97316" />
          <stop offset="60%" stopColor="#EF4444" />
          <stop offset="80%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
      </defs>

      {/* Active arc */}
      {fgPath && (
        <path
          d={fgPath}
          fill="none"
          stroke="url(#aqiGrad)"
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
      )}

      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke={color}
        strokeWidth={strokeW * 0.25}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={strokeW * 0.4} fill={color} />
      <circle cx={cx} cy={cy} r={strokeW * 0.18} fill="white" />

      {/* AQI value */}
      <text
        x={cx}
        y={cy + r * 0.35}
        textAnchor="middle"
        fontSize={size * 0.18}
        fontWeight="700"
        fill={color}
        fontFamily="Plus Jakarta Sans, system-ui"
      >
        {aqi}
      </text>
      <text
        x={cx}
        y={cy + r * 0.58}
        textAnchor="middle"
        fontSize={size * 0.07}
        fill="#64748B"
        fontFamily="Plus Jakarta Sans, system-ui"
      >
        AQI
      </text>
    </svg>
  );
}
