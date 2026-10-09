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

const { formatCurrentBasis } = await import('./dust.ts');

test('저장된 하루 평균 값은 실시간 값처럼 시각을 붙이지 않는다', () => {
  const label = formatCurrentBasis({ dataTime: '2026-10-08', source: 'stored_daily_latest' }, new Date(2026, 9, 9, 21));
  assert.equal(label, '10월 8일 하루 평균 · 실시간 측정값 없음');
});

test('실시간 값은 측정 시각과 경과 시간을 보여준다', () => {
  const label = formatCurrentBasis({ dataTime: '2026-10-09 20:00', source: 'realtime_current' }, new Date(2026, 9, 9, 21));
  assert.equal(label, '2026-10-09 20:00 기준 · 1시간 전');
});
