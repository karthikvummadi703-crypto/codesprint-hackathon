import { Badge, getAQIBadgeVariant } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PredictionForecast } from '../../types';

interface ForecastTableProps {
  forecasts: PredictionForecast[];
}

export default function ForecastTable({ forecasts }: ForecastTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Detailed Forecast Matrix</CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <caption className="sr-only">Detailed AQI forecast matrix</caption>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                Time Interval
              </th>
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                AQI Status
              </th>
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                PM2.5
              </th>
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                PM10
              </th>
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                NO₂
              </th>
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                O₃
              </th>
              <th
                scope="col"
                className="px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                CO
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {forecasts.map((row) => (
              <tr key={row.timeOffsetHours} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-semibold text-slate-900">{row.label}</td>
                <td className="px-6 py-4">
                  <Badge variant={getAQIBadgeVariant(row.status)} className="text-[10px]">
                    {row.aqi} — {row.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.pm25} µg/m³</td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.pm10} µg/m³</td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.no2} µg/m³</td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.o3} µg/m³</td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.co} mg/m³</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
