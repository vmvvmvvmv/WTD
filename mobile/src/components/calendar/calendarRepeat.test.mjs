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

test('반복 일정 "이후 일정 모두" 삭제는 앞선 일정과 다른 일정은 남긴다', async () => {
  const { withoutFollowingOccurrences } = await import('./calendarRepeat.ts');
  const series = ['2026-10-10', '2026-10-17', '2026-10-24'].map((date, index) => ({ ...base, date, endDate: date, id: `s${index}`, repeatGroupId: 'g1' }));
  const other = { ...base, date: '2026-10-20', endDate: '2026-10-20', id: 'other' };
  const left = withoutFollowingOccurrences([...series, other], series[1]);
  assert.deepEqual(left.map((event) => event.id), ['s0', 'other']);
  assert.deepEqual(withoutFollowingOccurrences([other], other), []);
});

test('매일 반복 일정이 있어도 일정 하나를 더 넣으면 아무것도 사라지지 않는다', async () => {
  const { withAddedEvents } = await import('./calendarRepeat.ts');
  const daily = buildRepeatedEvents(base, { endDate: '2027-12-31', mode: 'daily', weekdays: [] });
  const added = { ...base, date: '2027-06-01', endDate: '2027-06-01', id: 'new' };
  const next = withAddedEvents(daily, [added]);
  assert.equal(next.length, daily.length + 1);
  assert.ok(next.some((event) => event.id === 'new'));
});

test('상한을 넘으면 가장 오래된 일정부터 지운다', async () => {
  const { MAX_STORED_EVENTS, withAddedEvents } = await import('./calendarRepeat.ts');
  const old = { ...base, date: '2000-01-01', endDate: '2000-01-01', id: 'old' };
  const many = Array.from({ length: MAX_STORED_EVENTS }, (_, index) => ({ ...base, id: `e${index}` }));
  const next = withAddedEvents([old, ...many.slice(1)], [{ ...base, date: '2030-01-01', endDate: '2030-01-01', id: 'new' }]);
  assert.equal(next.length, MAX_STORED_EVENTS);
  assert.ok(!next.some((event) => event.id === 'old'));
  assert.equal(next.at(-1).id, 'new');
});

test('매년·매월 반복도 종료일을 지키고, 기본 종료일이면 30년·120개월 동안 반복한다', async () => {
  const { nextDefaultRepeatEndDate } = await import('./calendarRepeat.ts');
  const birthday = { ...base, date: '2026-03-15', endDate: '2026-03-15' };
  const yearly = buildRepeatedEvents(birthday, { endDate: nextDefaultRepeatEndDate('2026-03-15', 'yearly'), mode: 'yearly', weekdays: [] });
  assert.equal(yearly.length, 30);
  assert.equal(yearly.at(-1).date, '2055-03-15');
  const monthly = buildRepeatedEvents(birthday, { endDate: nextDefaultRepeatEndDate('2026-03-15', 'monthly'), mode: 'monthly', weekdays: [] });
  assert.equal(monthly.length, 120);
  assert.equal(buildRepeatedEvents(birthday, { endDate: '2028-12-31', mode: 'yearly', weekdays: [] }).length, 3);
  assert.equal(buildRepeatedEvents(birthday, { endDate: '2026-06-14', mode: 'monthly', weekdays: [] }).at(-1).date, '2026-05-15');
  assert.equal(nextDefaultRepeatEndDate('2026-03-15', 'daily'), '2026-04-14');
});
