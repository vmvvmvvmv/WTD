import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

// 앱 코드는 확장자 없이 import하므로, 테스트에서만 상대 경로를 .ts로 이어 줍니다.
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

const { buildRepeatedEvents } = await import('./calendarRepeat.ts');

const base = { date: '2026-10-12', endDate: '2026-10-12', id: 'base', time: '09:00', title: '주간 회의' };

test('weekly repeat reaches the chosen end date one year later', () => {
  const events = buildRepeatedEvents(base, { endDate: '2027-10-11', mode: 'weekly', weekdays: [1] });
  assert.equal(events.length, 53);
  assert.equal(events.at(-1).date, '2027-10-11');
});

test('weekly repeat stops at the occurrence cap, not a day cap', () => {
  const events = buildRepeatedEvents(base, { endDate: '2030-12-31', mode: 'weekly', weekdays: [1] });
  assert.equal(events.length, 160);
});

test('weekly repeat without weekdays falls back to the base event', () => {
  const events = buildRepeatedEvents(base, { endDate: '9999-12-31', mode: 'weekly', weekdays: [] });
  assert.equal(events.length, 1);
});
