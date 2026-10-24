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

const { memoEventToCalendarEvent, memoSuggestions } = await import('./calendarMemo.ts');
const base = { activity_type: 'indoor', date: '2026-10-25', end_date: '2026-10-25', end_time: '16:00', place: null, place_text: '', time: '15:00', title: '친구 만남' };

test('메모 일정은 찾은 장소의 좌표를 붙이고, 못 찾으면 이름만 남긴다', () => {
  const found = memoEventToCalendarEvent({ ...base, place: { address: '서울 강남구', label: '강남역', lat: 37.49, lng: 127.02, source: 'naver_local' }, place_text: '강남역' });
  assert.equal(found.location, '강남역');
  assert.equal(found.locationLat, 37.49);
  assert.equal(found.locationSource, 'naver_local');
  assert.equal(found.notificationHoursBefore, 1);

  const missing = memoEventToCalendarEvent({ ...base, place_text: '한강공원' });
  assert.equal(missing.location, '한강공원');
  assert.equal(missing.locationLat, undefined);

  assert.equal(memoEventToCalendarEvent(base).location, undefined);
  assert.notEqual(memoEventToCalendarEvent(base).id, memoEventToCalendarEvent(base).id);
});

test('자주·최근에 쓴 일정: 여러 번 쓴 것 먼저, 같으면 최근 것 먼저, 반복은 한 번만 센다', () => {
  const event = (id, title, time, location, extra = {}) => ({ activityType: 'outdoor', date: '2026-10-01', id, location, sensitive: false, time, title, ...extra });
  const events = [
    event('1000-a', '러닝', '07:00', '한강공원'),
    event('3000-b', '러닝', '07:00', '한강공원'),
    event('2000-c', '회의', '14:30', ''),
    event('4000-d', '치과', '10:00', '서울치과'),
    ...[1, 2, 3, 4, 5].map((n) => event(`500${n}-r`, '요가', '19:00', '', { repeatGroupId: 'g1' })),
    event('6000-e', '  ', '09:00', ''),
  ];
  assert.deepEqual(memoSuggestions(events), ['러닝 오전 7시 한강공원', '요가 오후 7시', '치과 오전 10시 서울치과', '회의 오후 2시 30분']);
  assert.deepEqual(memoSuggestions(events, 2), ['러닝 오전 7시 한강공원', '요가 오후 7시']);
  assert.deepEqual(memoSuggestions([event('1-x', '점심', '12:00', ''), event('2-y', '야식', '00:00', '')]), ['야식 오전 12시', '점심 오후 12시']);
});
