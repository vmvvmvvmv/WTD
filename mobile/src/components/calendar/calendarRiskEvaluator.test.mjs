import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.')) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { evaluateCalendarEventRisk } = await import('./calendarRiskEvaluator.ts');

const event = {
  activityType: 'outdoor',
  date: '2026-10-12',
  endTime: '12:00',
  id: 'event-1',
  sensitive: false,
  time: '10:00',
  title: '약속',
};

test('uses the worst weather inside the event window and summarizes rain timing', () => {
  const result = evaluateCalendarEventRisk(event, {
    todayDateLabel: '2026-10-09',
    weatherItems: [
      { date: '2026-10-12', hour: '10:00', label: '맑음', rain_mm: 0, rain_probability: 20, temperature: 18, wind_speed: 2 },
      { date: '2026-10-12', hour: '11:00', label: '비', rain_mm: 4, rain_probability: 80, temperature: 17, wind_speed: 3 },
    ],
  });

  assert.equal(result.level, 'bad');
  assert.equal(result.rainProbability, 80);
  assert.equal(result.rainMm, 4);
  assert.equal(result.rainTimeRange, '11:00~12:00');
  assert.match(result.desc, /우산 챙기셨나요/);
});

test('does not reuse a far-away observation or current weather for a later schedule today', () => {
  const evening = { ...event, date: '2026-10-10', endTime: '19:00', time: '18:00' };
  const result = evaluateCalendarEventRisk(evening, {
    now: new Date(2026, 9, 10, 14, 0),
    todayDateLabel: '2026-10-10',
    weather: { label: '맑음', temperature: 22 },
    weatherItems: [
      { date: '2026-10-10', hour: '14:00', label: '맑음', rain_mm: 0, rain_probability: 10, temperature: 22, wind_speed: 1 },
    ],
  });

  assert.equal(result.weatherLabel, undefined);
  assert.equal(result.temperature, undefined);
});

test('uses the 18:00 rain forecast once it is loaded', () => {
  const evening = { ...event, date: '2026-10-10', endTime: '19:00', time: '18:00' };
  const result = evaluateCalendarEventRisk(evening, {
    now: new Date(2026, 9, 10, 14, 0),
    todayDateLabel: '2026-10-10',
    weather: { label: '맑음', temperature: 22 },
    weatherItems: [
      { date: '2026-10-10', hour: '14:00', label: '맑음', rain_mm: 0, rain_probability: 10, temperature: 22, wind_speed: 1 },
      { date: '2026-10-10', hour: '18:00', label: '비', rain_mm: 2, rain_probability: 80, temperature: 19, wind_speed: 2 },
    ],
  });

  assert.equal(result.weatherLabel, '비');
  assert.equal(result.rainTimeRange, '18:00~19:00');
});

test('still uses current weather for a schedule starting soon', () => {
  const soon = { ...event, date: '2026-10-10', endTime: '16:00', time: '15:00' };
  const result = evaluateCalendarEventRisk(soon, {
    now: new Date(2026, 9, 10, 14, 0),
    todayDateLabel: '2026-10-10',
    weather: { label: '맑음', temperature: 22 },
    weatherItems: [],
  });

  assert.equal(result.weatherLabel, '맑음');
});
