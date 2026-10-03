import assert from 'node:assert/strict';
import test from 'node:test';

import { hasCompleteDashboardCache } from './dashboardCachePolicy.ts';

const baseSnapshot = {
  currentItem: { pm10Value: '20' },
  weatherHourlyItems: [],
};

test('dust-only cache must refresh weather forecast', () => {
  assert.equal(hasCompleteDashboardCache(baseSnapshot), false);
  assert.equal(hasCompleteDashboardCache({
    ...baseSnapshot,
    weatherHourlyItems: [{ phase: 'stored', temperature: 23 }],
  }), false);
});

test('cache with a forecast can skip the refresh', () => {
  assert.equal(hasCompleteDashboardCache({
    ...baseSnapshot,
    weatherHourlyItems: [{ phase: 'stored' }, { phase: 'forecast', temperature: 24 }],
  }), true);
});
