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

const { bestOutingWindowText, findBestOutingWindow } = await import('./bestOutingWindow.ts');

const today = '2026-10-10';
const hour = (h, overrides = {}) => ({ date: today, hour: `${String(h).padStart(2, '0')}:00`, label: '맑음', rain_probability: 10, temperature: 19, wind_speed: 2, ...overrides });

test('비 오는 시간을 피해 연속 2시간을 고른다', () => {
  const weatherItems = [hour(13, { label: '비', rain_probability: 80 }), hour(14, { label: '비', rain_probability: 70 }), hour(15), hour(16), hour(17, { label: '비' })];
  const window = findBestOutingWindow({ dustItems: [], fallbackPm10: 20, nowHour: 13, todayDateLabel: today, weatherItems });
  assert.deepEqual(bestOutingWindowText(window), { details: '맑음 · 미세먼지 좋음 · 19°', time: '15~17시' });
});

test('지난 시간과 다른 날은 빼고, 좋은 시간이 없으면 null', () => {
  const weatherItems = [hour(9), hour(10), hour(15, { label: '비' }), { ...hour(16), date: '2026-10-11' }];
  assert.equal(findBestOutingWindow({ dustItems: [], nowHour: 12, todayDateLabel: today, weatherItems }), null);
});

test('민감군은 미세먼지 보통인 시간을 뺀다', () => {
  const weatherItems = [hour(14), hour(15), hour(16)];
  const dustItems = [{ date: today, hour: '14:00', pm10Value: 50 }, { date: today, hour: '15:00', pm10Value: 50 }, { date: today, hour: '16:00', pm10Value: 25 }];
  assert.equal(findBestOutingWindow({ dustItems, nowHour: 14, todayDateLabel: today, weatherItems }).startHour, 14);
  const sensitive = findBestOutingWindow({ dustItems, nowHour: 14, sensitive: true, todayDateLabel: today, weatherItems });
  assert.deepEqual([sensitive.startHour, sensitive.endHour], [16, 17]);
});
