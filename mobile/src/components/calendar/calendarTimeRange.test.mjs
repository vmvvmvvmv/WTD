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

const { durationMinutes, endForTime, formatDuration } = await import('./calendarUtils.ts');

test('종료 시각이 시작보다 늦으면 같은 날', () => {
  assert.deepEqual(endForTime('2026-10-10', '09:00', '11:30'), { date: '2026-10-10', time: '11:30' });
});

test('종료 시각이 시작과 같거나 이르면 다음 날(자정을 넘는 일정)', () => {
  assert.deepEqual(endForTime('2026-10-10', '23:00', '01:00'), { date: '2026-10-11', time: '01:00' });
  assert.deepEqual(endForTime('2026-10-31', '22:00', '22:00'), { date: '2026-11-01', time: '22:00' });
});

test('일정 길이를 분으로 계산하고 읽기 쉽게 보여준다', () => {
  assert.equal(durationMinutes('2026-10-10', '23:00', '2026-10-11', '01:30'), 150);
  assert.equal(formatDuration(150), '2시간 30분');
  assert.equal(formatDuration(60), '1시간');
  assert.equal(formatDuration(30), '30분');
  assert.equal(formatDuration(0), '');
});

test('기본 종료 시각은 자정을 넘으면 그날 23:59로 자른다', async () => {
  const { addMinutesWithinDay } = await import('./calendarUtils.ts');
  assert.deepEqual(addMinutesWithinDay('2026-10-10', '23:00', 60), { date: '2026-10-10', time: '23:59' });
  assert.deepEqual(addMinutesWithinDay('2026-10-10', '14:00', 60), { date: '2026-10-10', time: '15:00' });
});
