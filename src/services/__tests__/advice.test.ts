/**
 * Guards for the AI assistant's environmental analysis logic.
 *
 * `buildAdvice` is the one place the page decides what to tell the user, so
 * these cases pin the behaviour that must not regress: never present an
 * unavailable reading as a number, and never state a certainty the data
 * does not support.
 */
import { describe, it, expect } from 'vitest';
import { buildAdvice, driverNotes } from '../advice';

describe('buildAdvice', () => {
  const reading = (over: Record<string, unknown> = {}) => ({
    aqi: 120,
    status: 'Unhealthy for Sensitive Groups',
    dominantPollutant: 'PM2.5',
    pollutants: [{ id: 'pm25', name: 'PM2.5', value: 55, unit: 'µg/m³' }],
    ...over,
  });

  it('names the dominant pollutant and its measured value', () => {
    const advice = buildAdvice({ airQuality: reading() });
    expect(advice.pollutant).toContain('PM2.5');
    expect(advice.pollutant).toContain('55');
  });

  it('never invents a pollutant value when the reading is missing', () => {
    const advice = buildAdvice({ airQuality: null });
    expect(advice.pollutant).not.toMatch(/\d+\s*µg/);
    expect(advice.pollutant.toLowerCase()).toContain('unavailable');
  });

  it('does not claim a number when every pollutant is null', () => {
    const advice = buildAdvice({
      airQuality: reading({ pollutants: [{ id: 'pm25', name: 'PM2.5', value: null }] }),
    });
    expect(advice.pollutant).not.toMatch(/\d+\s*µg/);
  });

  it('reports high AQI as a caution, not a guarantee', () => {
    const advice = buildAdvice({ airQuality: reading({ aqi: 180 }) });
    expect(advice.headline.toLowerCase()).not.toContain('safe');
    expect(advice.actions.length).toBeGreaterThan(0);
  });

  it('gives fewer cautions when air is clean', () => {
    const clean = buildAdvice({ airQuality: reading({ aqi: 30, status: 'Good' }) });
    const dirty = buildAdvice({ airQuality: reading({ aqi: 200, status: 'Unhealthy' }) });
    expect(clean.actions.length).toBeLessThan(dirty.actions.length);
  });

  it('states the real category instead of a vague one', () => {
    const advice = buildAdvice({ airQuality: reading({ aqi: 75, status: 'Moderate' }) });
    expect(advice.headline).toContain('Moderate');
  });

  it('says so plainly when there is no AQI reading at all', () => {
    const advice = buildAdvice({ airQuality: null });
    expect(advice.headline.toLowerCase()).toContain('unavailable');
    expect(advice.actions).toHaveLength(0);
  });

  it('surfaces high UV only when UV is actually high', () => {
    const high = buildAdvice({ airQuality: reading(), weather: { current: { uvIndex: 9 } } });
    const low = buildAdvice({ airQuality: reading(), weather: { current: { uvIndex: 1 } } });
    expect(high.notes.join(' ')).toContain('UV');
    expect(low.notes.join(' ')).not.toContain('UV');
  });

  it('explains still air and strong wind differently', () => {
    const still = buildAdvice({ airQuality: reading(), weather: { current: { windSpeed: 1.2 } } });
    const breezy = buildAdvice({ airQuality: reading(), weather: { current: { windSpeed: 18 } } });
    const stillText = still.notes.join(' ').toLowerCase();
    const breezyText = breezy.notes.join(' ').toLowerCase();
    expect(stillText).toContain('not being dispersed');
    expect(breezyText).toContain('disperse');
    expect(stillText).not.toBe(breezyText);
  });

  it('treats missing weather as absent, not as zero', () => {
    const advice = buildAdvice({ airQuality: reading(), weather: null });
    expect(advice.notes.join(' ')).not.toContain('0 km/h');
  });

  it('gives general advice without diagnosing the individual', () => {
    const advice = buildAdvice({ airQuality: reading({ aqi: 210 }) });
    const text = advice.actions.join(' ').toLowerCase();
    expect(text).not.toMatch(/diagnos|\bcure\b|you have|your lungs are|prescribe/);
  });

  it('is safe with no input at all', () => {
    const advice = buildAdvice({});
    expect(advice.headline).toBeTruthy();
    expect(Array.isArray(advice.actions)).toBe(true);
  });
});

describe('driverNotes', () => {
  it('does not claim rain clears pollution', () => {
    const notes = driverNotes({
      airQuality: { aqi: 100, pollutants: [{ id: 'pm25', name: 'PM2.5', value: 40 }] },
      weather: { current: { precipitationProbability: 80, windSpeed: 6, uvIndex: 5 } },
    });
    const text = notes.join(' ').toLowerCase();
    expect(text).not.toMatch(/rain (will )?(clear|remove|wash)/);
  });

  it('links high UV to ozone rather than particulates', () => {
    const notes = driverNotes({
      airQuality: { aqi: 90, pollutants: [{ id: 'o3', name: 'O₃', value: 70 }] },
      weather: { current: { uvIndex: 10, windSpeed: 9, precipitationProbability: 0 } },
    });
    expect(notes.join(' ').toLowerCase()).toContain('ozone');
  });

  it('is empty when there is nothing to say', () => {
    expect(driverNotes({ airQuality: null, weather: null })).toHaveLength(0);
  });
});
