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

const { buildCalendarRiskByEvent } = await import('./calendarForecast.ts');
const { calendarEventLocationKey } = await import('./calendarLocation.ts');

const event = {
  activityType: 'outdoor', date: '2026-10-25', endTime: '16:00', id: 'busan', location: '부산 대신동',
  locationCity: '부산', locationRegion: '대신동', locationLat: 35.1, locationLng: 129.0, sensitive: false, time: '15:00', title: '축구',
};
const busanWeather = [{ date: '2026-10-25', hour: '15:00', label: '맑음', rain_mm: 0, rain_probability: 10, temperature: 18, wind_speed: 2 }];

test('선택 장소 미세먼지가 없으면 홈 지역 미세먼지로 채우지 않는다', () => {
  const key = calendarEventLocationKey(event);
  const risk = buildCalendarRiskByEvent([event], {
    currentPm10: 170,
    eventLocationForecasts: { [key]: { dustItems: [], weatherHourlyItems: busanWeather } },
    todayDateLabel: '2026-10-25',
  }).busan;
  assert.notEqual(risk.pm10, 170);
  assert.equal(risk.temperature, 18);
});
