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

const { formatDistanceKm, placesWithNearestStation, stationResults } = await import('./regionPlaceSearch.ts');
const { nearestStation } = await import('../stations/stationUtils.ts');

const daesin = { city: '서구', lat: 35.1106, lng: 129.0176, name: '대신동', sido: '부산' };
const jeonpo = { city: '부산진구', lat: 35.1546, lng: 129.0663, name: '전포동', sido: '부산' };
const noCoords = { city: '어딘가', name: '좌표 없음', sido: '부산' };

test('장소 좌표에서 가장 가까운 측정소를 고르고 좌표 없는 측정소는 건너뛴다', () => {
  assert.equal(nearestStation([noCoords, jeonpo, daesin], 35.112, 129.019).station, daesin);
  assert.equal(nearestStation([noCoords], 35.1, 129.0), null);
});

test('검색한 장소마다 근처 측정소와 거리를 붙인다', () => {
  const [result] = placesWithNearestStation([{ address: '부산 서구 대신동', label: '동아대 구덕캠퍼스', lat: 35.1157, lng: 129.0176 }], [jeonpo, daesin]);
  assert.equal(result.title, '동아대 구덕캠퍼스');
  assert.equal(result.station, daesin);
  assert.ok(result.distanceKm > 0.4 && result.distanceKm < 0.7);
  assert.equal(placesWithNearestStation([{ label: '어디', lat: 35, lng: 129 }], []).length, 0);
});

test('측정소 이름으로 찾은 결과는 거리 없이 지역 이름으로 보인다', () => {
  assert.deepEqual(stationResults([daesin]).map(({ distanceKm, title }) => ({ distanceKm, title })), [{ distanceKm: null, title: '부산 서구' }]);
  assert.equal(formatDistanceKm(0.42), '420m');
  assert.equal(formatDistanceKm(3.25), '3.3km');
});
