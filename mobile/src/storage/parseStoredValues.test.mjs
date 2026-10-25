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

const { parseStoredFavoriteRegions, parseStoredMapRecentSearches } = await import('./parseStoredValues.ts');

test('즐겨찾기·최근 검색은 깨진 항목만 건너뛰고 나머지는 남긴다', () => {
  const favorites = parseStoredFavoriteRegions(JSON.stringify([null, 1, 'x', { city: '부산', region: '대신동' }]));
  assert.deepEqual(favorites.map((item) => item.region), ['대신동']);
  const recent = parseStoredMapRecentSearches(JSON.stringify([null, { sido: '부산', name: '대신동', lat: 35.1, lng: 129 }]));
  assert.deepEqual(recent.map((item) => item.name), ['대신동']);
});
