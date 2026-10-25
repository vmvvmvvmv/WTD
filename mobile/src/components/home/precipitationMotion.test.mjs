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

const { fallTiltDegrees, rainDropCount, snowFlakeCount } = await import('./precipitationMotion.ts');

test('강수량이 많을수록 빗줄기가 많아진다(24~100개)', () => {
  assert.equal(rainDropCount(0), 24);
  assert.ok(rainDropCount(1) > rainDropCount(0.2));
  assert.ok(rainDropCount(5) > rainDropCount(1));
  assert.equal(rainDropCount(10), 100);
  assert.equal(rainDropCount(80), 100);
  assert.equal(rainDropCount(undefined), rainDropCount(1)); // 강수량을 모르면 보통 비
  assert.equal(rainDropCount(-3), 24);
});

test('바람이 셀수록 더 기운다(5°~45°)', () => {
  assert.equal(fallTiltDegrees(0), 5);
  assert.ok(fallTiltDegrees(5) > fallTiltDegrees(2));
  assert.equal(fallTiltDegrees(10), 45);
  assert.equal(fallTiltDegrees(30), 45);
  assert.equal(fallTiltDegrees(undefined), fallTiltDegrees(2)); // 풍속을 모르면 약한 바람
  assert.equal(fallTiltDegrees(Number.NaN), fallTiltDegrees(2));
});

test('눈도 강수량이 많을수록 많아진다(20~90개)', () => {
  assert.equal(snowFlakeCount(0), 20);
  assert.ok(snowFlakeCount(2) > snowFlakeCount(0.5));
  assert.equal(snowFlakeCount(5), 90);
  assert.equal(snowFlakeCount(40), 90);
  assert.equal(snowFlakeCount(undefined), snowFlakeCount(1));
});
