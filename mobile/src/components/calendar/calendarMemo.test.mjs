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

const { isRepeatMemo, memoEventToCalendarEvent, memoSuggestions, withMemoHistory } = await import('./calendarMemo.ts');
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

test('전에 적은 메모: 최근 것이 앞, 같은 메모는 하나, 최대 5개', () => {
  let history = [];
  for (const memo of ['a', 'b', 'c', ' a ', 'd', 'e', 'f']) history = withMemoHistory(history, memo);
  assert.deepEqual(history, ['f', 'e', 'd', 'a', 'c']);
  assert.deepEqual(withMemoHistory(history, '   '), history);
});

test('반복 일정 메모는 알아보고, 한 번짜리는 그대로 둔다', () => {
  for (const text of ['매주 월요일 9시 회의', '매일 아침 7시 러닝', '매달 1일 월세', '격주 토요일 축구', '월요일마다 요가', '주 3회 헬스', '매 주 수요일 수업', '매주월요일 요가', '매일아침 러닝', '매주말 등산']) {
    assert.equal(isRepeatMemo(text), true, text);
  }
  for (const text of ['내일 3시 친구 약속', '다음 주 월요일 2시 회의', '매운탕 먹기 토요일 6시', '이번 달 25일 3시 미용실', '매일유업 면접 내일 10시', '매월드 공연 토요일 3시', '매주하는 거 아님 내일 2시 회의']) {
    assert.equal(isRepeatMemo(text), false, text);
  }
});
