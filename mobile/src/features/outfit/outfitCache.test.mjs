import assert from 'node:assert/strict';
import test from 'node:test';

import { outfitCacheKeyForEvents } from './outfitCache.ts';

const event = { activityType: 'outdoor', date: '2026-10-09', id: 'event-1', time: '09:00', title: '출근' };

test('changing an event title produces a new outfit cache key', () => {
  assert.notEqual(
    outfitCacheKeyForEvents([event], 'normal'),
    outfitCacheKeyForEvents([{ ...event, title: '러닝' }], 'normal'),
  );
});
