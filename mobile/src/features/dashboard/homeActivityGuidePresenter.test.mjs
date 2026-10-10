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

const { activityForecastLabel, activityWeatherKind, buildHomeActivityGuideItems } = await import('./homeActivityGuidePresenter.ts');

const risk = (overrides) => ({ badge: '', basis: '', desc: '', icon: 'walk-outline', level: 'watch', tone: '', ...overrides });

test('비가 겹치는 일정은 시간대와 강수확률을 보여준다', () => {
  const value = risk({ rainProbability: 70, rainTimeRange: '15:00~17:00', weatherLabel: '비' });
  assert.equal(activityWeatherKind(value), 'rain');
  assert.equal(activityForecastLabel(value), '15:00~17:00 비 예보 · 강수 70%');
});

test('맑은 일정은 날씨와 기온을 보여준다', () => {
  const value = risk({ temperature: 18.4, weatherLabel: '맑음' });
  assert.equal(activityWeatherKind(value), 'clear');
  assert.equal(activityForecastLabel(value), '맑음 · 18°');
});

test('눈·강풍·흐림·예보 없음을 구분한다', () => {
  assert.equal(activityWeatherKind(risk({ weatherLabel: '눈' })), 'snow');
  assert.equal(activityForecastLabel(risk({ windSpeed: 9.2, windTimeRange: '13:00~14:00', weatherLabel: '맑음' })), '13:00~14:00 강풍 · 최대 9m/s');
  assert.equal(activityWeatherKind(risk({ weatherLabel: '구름많음' })), 'cloudy');
  assert.equal(activityForecastLabel(risk({ level: 'unknown' })), '');
});

test('날씨 예보가 아직 없으면 맑음이라고 단정하지 않는다', () => {
  const value = risk({ pm10: 25 });
  assert.equal(activityWeatherKind(value), 'unknown');
  assert.equal(activityForecastLabel(value), '이 시간대 날씨 예보를 아직 받지 못했어요');
});

test('민감군 모드면 미세먼지 보통에도 마스크를 권한다', () => {
  const event = { activityType: 'outdoor', date: '2026-10-10', id: 'e', sensitive: false, time: '15:00', title: '산책' };
  const riskByEvent = { e: risk({ level: 'good', pm10: 50, temperature: 20, weatherLabel: '맑음' }) };
  assert.equal(buildHomeActivityGuideItems([event], riskByEvent, '2026-10-10', '12:00')[0].advice, '예정대로 나가도 괜찮겠어요.');
  assert.match(buildHomeActivityGuideItems([event], riskByEvent, '2026-10-10', '12:00', true)[0].advice, /마스크/);
});
