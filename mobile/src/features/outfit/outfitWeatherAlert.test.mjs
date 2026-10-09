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

const { buildOutfitWeatherAlert, formatRainWindow } = await import('./outfitWeatherAlert.ts');

const result = (condition, snapshot = {}) => ({ weather_condition: condition, weather_snapshot: snapshot });

test('비 시간대를 "15~17시"처럼 보여준다', () => {
  assert.equal(formatRainWindow('15:00', '17:00'), '15~17시');
  assert.equal(formatRainWindow('09:00', '10:00'), '9시');
  assert.equal(formatRainWindow('23:00', '00:00'), '23시');
  assert.equal(formatRainWindow(null, '17:00'), '');
});

test('소나기는 시간대와 우산을 알린다', () => {
  const alert = buildOutfitWeatherAlert(result('showers', { rain_start: '15:00', rain_end: '17:00' }));
  assert.equal(alert.title, '소나기 주의');
  assert.match(alert.detail, /15~17시 잠깐 비/);
});

test('비·눈·강풍만 주의를 띄우고 평소 날씨는 띄우지 않는다', () => {
  assert.equal(buildOutfitWeatherAlert(result('rain')).title, '비 주의');
  assert.equal(buildOutfitWeatherAlert(result('snow')).kind, 'snow');
  assert.match(buildOutfitWeatherAlert(result('strong_wind', { wind_max: 11.4, rain_start: '12:00', rain_end: '13:00' })).detail, /최대 11m\/s.*12시/);
  assert.equal(buildOutfitWeatherAlert(result('normal')), null);
});
