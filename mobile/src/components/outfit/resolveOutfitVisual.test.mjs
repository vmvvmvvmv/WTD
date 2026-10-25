import assert from 'node:assert/strict';
import test from 'node:test';

const { resolveOutfitVisual } = await import('./resolveOutfitVisual.ts');
const result = (band, overrides = {}) => ({
  outfit: { band },
  occasion: 'casual',
  must_have: [],
  ...overrides,
});

test('일반 옷차림 그림은 서버가 고른 기온 구간을 따른다', () => {
  const expected = ['hot', 'hot', 'warm', 'mild', 'cool', 'cold', 'cold', 'freezing', 'freezing'];
  expected.forEach((key, index) => assert.equal(resolveOutfitVisual(result(`B${index + 1}`)), key));
});

test('비·눈·강풍·소나기에도 옷 두께에 맞는 인물을 고른다', () => {
  for (const weather_condition of ['rain', 'snow', 'strong_wind', 'showers']) {
    assert.equal(resolveOutfitVisual(result('B1', { weather_condition })), 'hot');
    assert.equal(resolveOutfitVisual(result('B9', { weather_condition })), 'freezing');
  }
});

test('운동 그림은 기온에 따라 바뀌고 양산은 더운 일반 옷차림에만 우선한다', () => {
  for (const occasion of ['running', 'sport']) {
    assert.equal(resolveOutfitVisual(result('B1', { occasion })), 'sport');
    assert.equal(resolveOutfitVisual(result('B4', { occasion })), 'sportCool');
    assert.equal(resolveOutfitVisual(result('B8', { occasion })), 'sportCold');
  }
  const must_have = [{ type: 'sun_parasol' }];
  assert.equal(resolveOutfitVisual(result('B1', { must_have })), 'heatwave');
  assert.equal(resolveOutfitVisual(result('B3', { must_have })), 'warm');
  assert.equal(resolveOutfitVisual(result('B1', { occasion: 'sport', must_have })), 'sport');
});
