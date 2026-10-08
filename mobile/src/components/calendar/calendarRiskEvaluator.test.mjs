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
