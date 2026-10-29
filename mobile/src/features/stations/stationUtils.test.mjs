import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSearchText } from './stationUtils.ts';

const matches = (keyword, target) => normalizeSearchText(target).includes(normalizeSearchText(keyword));

test('시·군·면 접미사가 달라도 지역 검색어를 맞춘다', () => {
  assert.equal(normalizeSearchText('수원시 권선구'), normalizeSearchText('수원 권선'));
  assert.ok(matches('홍천 서면', '강원특별자치도 홍천군 서면'));
  assert.ok(matches('대신', '부산 서구 대신동'));
});

test('두 글자 구 이름은 다른 동네까지 넓게 걸리지 않는다', () => {
  assert.ok(matches('중구', '부산 중구'));
  assert.ok(!matches('중구', '서울 중동'));
  assert.ok(!matches('동구', '부산 동래구'));
  assert.ok(!matches('남구', '서울 강남구'));
});
