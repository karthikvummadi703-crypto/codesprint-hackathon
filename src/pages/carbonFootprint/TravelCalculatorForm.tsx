import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Label } from '../../components/ui/Input';
import { TravelModePicker } from './TravelModePicker';
import type { TripFormController } from './useTripForm';

function RouteFields({ form }: { form: TripFormController }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="from">From (Origin)</Label>
        <Input
          id="from"
          placeholder="e.g. Gudur Station"
          value={form.from}
          onChange={e => form.setFrom(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="to">To (Destination)</Label>
        <Input
          id="to"
          placeholder="e.g. Nellore Office"
          value={form.to}
          onChange={e => form.setTo(e.target.value)}
          required
        />
      </div>
    </div>
  );
}

interface TravelCalculatorFormProps {
  form: TripFormController;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function TravelCalculatorForm({ form, loading, onSubmit }: TravelCalculatorFormProps) {
  return (
    <Card className="lg:col-span-7">
      <CardHeader>
        <CardTitle>Travel Calculator</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <RouteFields form={form} />

          <div>
            <Label htmlFor="distance">Distance (km)</Label>
            <Input
              id="distance"
              type="number"
              step="0.1"
              placeholder="Leave blank to auto-estimate"
              value={form.distance || ''}
              onChange={e => form.setDistance(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <Label id="travel-mode-label">Mode of Travel</Label>
            <TravelModePicker
              selectedMode={form.selectedMode}
              onSelectMode={form.setSelectedMode}
            />
          </div>

          <Button type="submit" className="w-full h-11" loading={loading}>
            Calculate Emissions
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
