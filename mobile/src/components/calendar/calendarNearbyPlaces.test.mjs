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

const { nearbyPlaceQueries } = await import('./calendarNearbyPlaces.ts');
const context = { city: '부산광역시', district: '사하구', neighborhood: '괴정동' };

test('지도 동네와 구를 넣어 네이버 지역 검색어를 만든다', () => {
  assert.deepEqual(nearbyPlaceQueries('은행', context), ['부산광역시 사하구 괴정동 은행', '부산광역시 사하구 은행']);
  assert.deepEqual(nearbyPlaceQueries('은행', { ...context, city: '', district: '', neighborhood: '' }), []);
});

