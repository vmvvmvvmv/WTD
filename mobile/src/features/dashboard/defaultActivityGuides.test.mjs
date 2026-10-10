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

const { buildDefaultActivityGuides } = await import('./defaultActivityGuides.ts');

const today = '2026-10-10';
const hour = (h, overrides = {}) => ({ date: today, hour: `${String(h).padStart(2, '0')}:00`, label: '맑음', rain_probability: 10, temperature: 18, ...overrides });

test('맑은 날은 산책 시간과 환기를 권한다', () => {
  const guides = buildDefaultActivityGuides({
    bestWindow: { endHour: 17, pm10: 20, startHour: 15, temperature: 19, weatherLabel: '맑음' },
    currentPm10: 20,
    nowHour: 12,
    todayDateLabel: today,
    weatherItems: [hour(12), hour(15), hour(18)],
  });
  assert.deepEqual(guides.map((guide) => guide.title), ['산책·야외 활동', '환기하기 좋은 날']);
  assert.match(guides[0].detail, /^15~17시가 가장 좋아요/);
  assert.equal(guides[0].caution, false);
});

test('비 오는 날은 첫 비 시간대를 알리고 실내 활동을 권한다', () => {
  const guides = buildDefaultActivityGuides({
    bestWindow: null,
    currentPm10: 40,
    nowHour: 12,
    todayDateLabel: today,
    weatherItems: [hour(13), hour(15, { label: '비', rain_probability: 80 }), hour(16, { label: '비' }), hour(20, { label: '비' }), hour(9, { label: '비' })],
  });
  assert.equal(guides[0].detail, '15~17시 비 예보가 있어요. 그 시간은 피해서 나가세요.');
  assert.equal(guides[1].title, '실내 활동 추천');
  assert.equal(guides.length, 2);
});

test('민감군이면 미세먼지 보통부터 야외를 줄이고 실내를 권한다', () => {
  const guides = buildDefaultActivityGuides({
    bestWindow: null,
    currentPm10: 50,
    nowHour: 6,
    sensitive: true,
    todayDateLabel: today,
    weatherItems: [hour(6, { temperature: 4 }), hour(14, { temperature: 17 })],
  });
  assert.equal(guides[0].detail, '미세먼지가 나빠요. 밖에 오래 있지 않는 게 좋아요.');
  assert.equal(guides[1].title, '실내 활동 추천');
});
