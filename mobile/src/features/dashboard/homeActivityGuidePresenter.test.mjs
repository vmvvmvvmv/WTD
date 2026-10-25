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

test('하루 일정은 끝나는 시각이 지나야 완료로 표시한다', () => {
  const event = { activityType: 'outdoor', date: '2026-10-23', endDate: '2026-10-23', endTime: '16:00', id: 'e', sensitive: false, time: '14:00', title: '산책' };
  const completedAt = (time) => buildHomeActivityGuideItems([event], { e: risk({}) }, '2026-10-23', time)[0].isCompleted;
  assert.equal(completedAt('13:59'), false);
  assert.equal(completedAt('14:30'), false);
  assert.equal(completedAt('16:00'), true);
});

test('천둥번개 예보는 맑음이 아니라 천둥으로 보여 준다', async () => {
  const { getWeatherVisualKind } = await import('../../utils/weather.ts');
  assert.equal(activityWeatherKind(risk({ weatherLabel: '천둥번개', temperature: 18 })), 'thunder');
  assert.equal(activityWeatherKind(risk({ weatherLabel: '비·천둥번개', rainProbability: 80 })), 'thunder');
  assert.equal(getWeatherVisualKind('천둥번개'), 'rain');
});

test('천둥번개는 시간대를 보여 주고, 눈 없는 영하에는 눈길 문구를 쓰지 않는다', () => {
  assert.equal(activityForecastLabel(risk({ rainTimeRange: '15:00~16:00', weatherLabel: '비·천둥번개', rainMm: 5 })), '15:00~16:00 천둥번개 예보');
  assert.equal(activityForecastLabel(risk({ weatherLabel: '천둥번개' })), '천둥번개 예보');
  const event = { activityType: 'outdoor', date: '2026-10-24', endDate: '2026-10-24', endTime: '16:00', id: 'c', sensitive: false, time: '14:00', title: '산책' };
  const advice = (weatherLabel) => buildHomeActivityGuideItems([event], { c: risk({ temperature: -12, weatherLabel }) }, '2026-10-24', '10:00')[0].advice;
  assert.doesNotMatch(advice('맑음'), /눈길/);
  assert.match(advice('눈'), /눈길/);
});

test('여러 날 일정의 시간 줄에는 날짜를 붙인다', () => {
  const trip = { activityType: 'transit', date: '2026-10-24', endDate: '2026-10-26', endTime: '18:00', id: 't', sensitive: false, time: '09:00', title: '출장' };
  const oneDay = { ...trip, endDate: '2026-10-24', id: 'd' };
  const items = buildHomeActivityGuideItems([trip, oneDay], { t: risk({}), d: risk({}) }, '2026-10-24', '10:00');
  assert.equal(items[0].timeLabel, '10-24 09:00~10-26 18:00');
  assert.equal(items[1].timeLabel, '09:00~18:00');
});
