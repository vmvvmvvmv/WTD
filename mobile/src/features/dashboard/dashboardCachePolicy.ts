import type { DashboardCacheSnapshot } from './dashboardCache';

export function hasCompleteDashboardCache(snapshot: DashboardCacheSnapshot | null): boolean {
  return Boolean(
    snapshot?.currentItem
    && snapshot.weatherHourlyItems.some((item) => item.phase === 'forecast' || item.source?.includes('forecast'))
  );
}
