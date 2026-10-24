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

const { evaluateCalendarEventRisk, rainFreeSuggestionText } = await import('./calendarRiskEvaluator.ts');

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

test('suggests the nearest rain-free time that is not in the past', () => {
  const weatherItems = [7, 8, 9, 10, 11, 12, 13, 14].map((hour) => ({
    date: '2026-10-12',
    hour: `${String(hour).padStart(2, '0')}:00`,
    label: hour === 10 || hour === 11 ? '비' : '맑음',
    rain_probability: hour === 10 || hour === 11 ? 80 : 10,
    temperature: 18,
  }));
  const earlier = evaluateCalendarEventRisk(event, { now: new Date(2026, 9, 9, 12, 0), todayDateLabel: '2026-10-09', weatherItems });
  assert.deepEqual(earlier.rainFreeSuggestion, { endTime: '10:00', offsetHours: -2, time: '08:00' });
  assert.match(earlier.desc, /2시간 앞당기면 비를 피할 수 있어요 \(08:00~10:00\)/);

  const later = evaluateCalendarEventRisk(event, { now: new Date(2026, 9, 12, 8, 30), todayDateLabel: '2026-10-12', weatherItems });
  assert.equal(rainFreeSuggestionText(later.rainFreeSuggestion), '2시간 미루면 비를 피할 수 있어요 (12:00~14:00)');
});

test('does not suggest a shift when every nearby hour is rainy', () => {
  const weatherItems = [7, 8, 9, 10, 11, 12, 13, 14, 15].map((hour) => ({ date: '2026-10-12', hour: `${String(hour).padStart(2, '0')}:00`, label: '비', rain_probability: 80 }));
  const result = evaluateCalendarEventRisk(event, { now: new Date(2026, 9, 9, 12, 0), todayDateLabel: '2026-10-09', weatherItems });
  assert.equal(result.rainFreeSuggestion, undefined);
});

test('여러 날 일정에서 비가 다른 날에 오면 시간대에 날짜를 붙인다', () => {
  const hours = (date) => Array.from({ length: 24 }, (_, h) => ({ date, hour: `${String(h).padStart(2, '0')}:00`, label: '흐림', rain_mm: 0, rain_probability: 10, temperature: 18 }));
  const weatherItems = [...hours('2026-10-24'), ...hours('2026-10-25'), ...hours('2026-10-26')]
    .map((item) => (item.date === '2026-10-26' && ['14:00', '15:00'].includes(item.hour) ? { ...item, label: '비', rain_mm: 3, rain_probability: 80 } : item));
  const trip = { activityType: 'outdoor', date: '2026-10-24', endDate: '2026-10-26', id: 'trip', sensitive: false, time: '09:00', endTime: '18:00', title: '출장' };
  const result = evaluateCalendarEventRisk(trip, { now: new Date('2026-10-24T10:00:00'), todayDateLabel: '2026-10-24', weatherItems });
  assert.equal(result.rainTimeRange, '10-26 14:00~16:00');
});
