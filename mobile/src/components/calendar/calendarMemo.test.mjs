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

const { memoEventToCalendarEvent } = await import('./calendarMemo.ts');
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
