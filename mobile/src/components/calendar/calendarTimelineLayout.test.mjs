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

const { buildTimelineBlocks } = await import('./calendarTimelineLayout.ts');

const event = (id, time, endTime, extra = {}) => ({ activityType: 'outdoor', date: '2026-10-11', endTime, id, sensitive: false, time, title: id, ...extra });

test('겹치는 일정은 나란히, 안 겹치면 한 칸', () => {
  const blocks = buildTimelineBlocks('2026-10-11', [
    event('a', '09:00', '11:00'),
    event('b', '10:00', '10:30'),
    event('c', '10:30', '12:00'),
    event('d', '13:00', '14:00'),
  ]);
  const byId = Object.fromEntries(blocks.map((block) => [block.event.id, block]));
  assert.deepEqual([byId.a.lane, byId.b.lane, byId.c.lane], [0, 1, 1]);
  assert.deepEqual([byId.a.lanes, byId.c.lanes, byId.d.lanes], [2, 2, 1]);
});

test('끝 시각 없으면 1시간, 여러 날 일정과 다른 날 일정은 빠짐', () => {
  const blocks = buildTimelineBlocks('2026-10-11', [
    event('a', '08:30'),
    event('trip', '09:00', '18:00', { endDate: '2026-10-13' }),
    event('other', '09:00', '10:00', { date: '2026-10-12' }),
  ]);
  assert.deepEqual(blocks.map((block) => [block.event.id, block.startMinute, block.endMinute]), [['a', 510, 570]]);
});
