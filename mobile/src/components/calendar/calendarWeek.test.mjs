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

const { addDays, buildWeekCells, startOfWeek, weekLabel } = await import('./calendarUtils.ts');

test('주는 일요일부터, 달·해를 넘겨도 7일', () => {
  assert.equal(startOfWeek('2026-10-11'), '2026-10-11'); // 일요일
  assert.equal(startOfWeek('2026-10-17'), '2026-10-11');
  assert.equal(startOfWeek('2027-01-01'), '2026-12-27');
  assert.deepEqual(buildWeekCells('2026-12-27').map((cell) => cell.date), [
    '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
  ]);
  assert.equal(addDays('2026-10-11', -7), '2026-10-04');
});

test('주 제목', () => {
  assert.equal(weekLabel('2026-10-11'), '2026년 10월 11~17일');
  assert.equal(weekLabel('2026-09-27'), '9월 27일 ~ 10월 3일');
});
