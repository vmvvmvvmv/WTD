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
const { nearestStation, stationForRegion } = await import('../stations/stationUtils.ts');
const { localAreaNames, mergePlaces, needsLocalSearch, sortByDistanceFrom } = await import('../places/naverPlaces.ts');

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

test('기준 좌표에서 가까운 장소부터, 주소 결과는 맨 앞, 좌표 없는 결과는 맨 뒤', () => {
  const origin = { lat: 35.11, lng: 129.02 }; // 부산 대신동 근처
  const seoul = { label: '서울 은행', lat: 37.5, lng: 127.0 };
  const busan = { label: '부산 은행', lat: 35.12, lng: 129.03 };
  const address = { label: '영동대로 513', lat: 37.51, lng: 127.06, source: 'naver_geocode' };
  const noCoords = { label: '좌표 없음' };
  assert.deepEqual(sortByDistanceFrom([seoul, noCoords, busan, address], origin).map((item) => item.label), ['영동대로 513', '부산 은행', '서울 은행', '좌표 없음']);
  assert.deepEqual(sortByDistanceFrom([seoul, busan], null).map((item) => item.label), ['서울 은행', '부산 은행']);
});

test('지역에 맞는 측정소를 찾는다', () => {
  assert.equal(stationForRegion([jeonpo, daesin], { city: '부산', region: '서구' }), daesin);
  assert.equal(stationForRegion([jeonpo], null), undefined);
});

test('결과가 모두 30km 넘게 멀 때만 지역 이름을 붙여 다시 찾고, 같은 장소는 한 번만 합친다', () => {
  const busan = { lat: 35.11, lng: 129.02 };
  const seoulCgv = { label: 'CGV 명동', lat: 37.56, lng: 126.98 };
  const busanCgv = { label: 'CGV 서면', lat: 35.16, lng: 129.06 };
  const address = { label: '부산 서구 대신동', lat: 35.11, lng: 129.02, source: 'naver_geocode' };
  assert.equal(needsLocalSearch([seoulCgv], busan), true);
  assert.equal(needsLocalSearch([seoulCgv, busanCgv], busan), false);
  assert.equal(needsLocalSearch([address], busan), true); // 주소 결과는 장소로 치지 않음
  assert.equal(needsLocalSearch([], busan), true);
  assert.deepEqual(mergePlaces([seoulCgv, busanCgv], [busanCgv, { ...busanCgv, label: 'CGV 센텀' }]).map((place) => place.label), ['CGV 명동', 'CGV 서면', 'CGV 센텀']);
});

test('다시 찾을 지역 이름은 좁은 것부터 시·도까지', () => {
  assert.deepEqual(localAreaNames('부산 대신동'), ['부산 대신동', '부산']);
  assert.deepEqual(localAreaNames('부산'), ['부산']);
  assert.deepEqual(localAreaNames(undefined), []);
});

test('이름이 검색어와 똑같은 먼 장소는 주변의 비슷한 이름보다 앞에 둔다', () => {
  const busan = { lat: 35.11, lng: 129.02 };
  const coex = { label: '코엑스', lat: 37.51, lng: 127.06 };
  const callVan = { label: '부산코엑스콜밴', lat: 35.16, lng: 129.06 };
  assert.deepEqual(sortByDistanceFrom([callVan, coex], busan, '코엑스').map((item) => item.label), ['코엑스', '부산코엑스콜밴']);
  assert.deepEqual(sortByDistanceFrom([coex, callVan], busan, '스타벅스').map((item) => item.label), ['부산코엑스콜밴', '코엑스']);
});
