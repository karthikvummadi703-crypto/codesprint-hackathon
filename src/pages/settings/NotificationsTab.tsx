import { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Label } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';

interface ThresholdControlProps {
  threshold: number;
  onThresholdChange: (value: number) => void;
}

function ThresholdControl({ threshold, onThresholdChange }: ThresholdControlProps) {
  return (
    <div className="space-y-3 pt-3 border-t border-slate-100">
      <Label htmlFor="threshold">Alert Threshold (AQI)</Label>
      <div className="flex items-center gap-4">
        <input
          id="threshold"
          type="range"
          min="50"
          max="300"
          step="10"
          value={threshold}
          aria-valuetext={`${threshold} AQI`}
          onChange={e => onThresholdChange(parseInt(e.target.value))}
          className="flex-1 accent-brand-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
        />
        <Badge variant="warning" className="h-8 px-3 shrink-0 text-sm">
          {threshold} AQI
        </Badge>
      </div>
      <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
        Notifications will fire whenever local readings exceed {threshold} AQI (Moderate/Unhealthy).
      </p>
    </div>
  );
}

interface NotificationsTabProps {
  notifications: boolean;
  onToggleNotifications: (value: boolean) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
}

export function NotificationsTab({
  notifications,
  onToggleNotifications,
  threshold,
  onThresholdChange,
}: NotificationsTabProps) {
  return (
    <div className="space-y-6">
      <CardHeader className="px-0 pt-0 pb-5">
        <CardTitle>Notification Trigger Levels</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 id="alert-notifications-label" className="text-sm font-semibold text-slate-800">
              Alert Notifications
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Receive immediate warnings when air pollution spikes
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notifications}
            aria-labelledby="alert-notifications-label"
            onClick={() => onToggleNotifications(!notifications)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              notifications ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                notifications ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {notifications && (
          <ThresholdControl threshold={threshold} onThresholdChange={onThresholdChange} />
        )}
      </CardContent>
    </div>
  );
}
