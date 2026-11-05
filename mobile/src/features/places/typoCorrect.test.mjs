import assert from 'node:assert/strict';
import test from 'node:test';

const { correctPlaceQuery, KNOWN_PLACE_NAMES } = await import('./typoCorrect.ts');

test('한두 글자 틀린 이름은 고치고, 맞거나 너무 다르면 그대로 둔다', () => {
  assert.equal(correctPlaceQuery('부산녁', KNOWN_PLACE_NAMES), '부산역');
  assert.equal(correctPlaceQuery('서울엯', KNOWN_PLACE_NAMES), '서울역');
  assert.equal(correctPlaceQuery('동대구엮', KNOWN_PLACE_NAMES), '동대구역');
  assert.equal(correctPlaceQuery('부산역', KNOWN_PLACE_NAMES), null);
  assert.equal(correctPlaceQuery('스타벅스', KNOWN_PLACE_NAMES), null);
  assert.equal(correctPlaceQuery('대신돋', ['대신동', '대신면']), '대신동');
});
