import * as FileSystem from 'expo-file-system/legacy';

import type { CurrentDustItem, HourlyDustItem, PastDustItem, PredictionResponse } from '../../types/dust';
import type { RegionState } from '../../types/region';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';

const CACHE_DIR = `${FileSystem.documentDirectory ?? ''}dashboard-cache`;
// 5분 안의 저장값은 그대로 쓰고(새로 안 불러옴), 12시간 안의 저장값은 먼저 보여 준 뒤 뒤에서 새로 불러옵니다.
// 앱을 켜자마자 빈 화면으로 몇 초 기다리지 않게 하려는 것(기준 시각에 'N시간 전'이 함께 보여서 오래된 값인 걸 알 수 있음).
export const DASHBOARD_CACHE_FRESH_MS = 5 * 60 * 1000;
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type DashboardCacheSnapshot = {
  currentItem: CurrentDustItem | null;
  currentNotice: string;
  hourlyItems: HourlyDustItem[];
  pastItems: PastDustItem[];
  prediction: PredictionResponse | null;
  savedAt: number;
  weather: WeatherState | null;
  weatherHourlyItems: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
  weatherTodayPastItems?: WeatherHourlyItem[];
  yesterdayWeather?: WeatherState | null;
};

function cacheFilePath(region: RegionState) {
  const safeKey = `${region.city}-${region.region}`.replace(/[^a-zA-Z0-9가-힣_.-]/g, '_');
  return `${CACHE_DIR}/${safeKey}.json`;
}

function isDashboardCacheSnapshot(value: unknown): value is DashboardCacheSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<DashboardCacheSnapshot>;
  return (
    typeof snapshot.savedAt === 'number'
    && Array.isArray(snapshot.hourlyItems)
    && Array.isArray(snapshot.pastItems)
    && Array.isArray(snapshot.weatherHourlyItems)
  );
}

export async function loadDashboardCache(region: RegionState) {
  if (!FileSystem.documentDirectory) return null;
  try {
    const filePath = cacheFilePath(region);
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return null;

    const snapshot = JSON.parse(await FileSystem.readAsStringAsync(filePath)) as unknown;
    if (!isDashboardCacheSnapshot(snapshot)) return null;
    if (Date.now() - snapshot.savedAt > CACHE_MAX_AGE_MS) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export async function saveDashboardCache(region: RegionState, snapshot: Omit<DashboardCacheSnapshot, 'savedAt'>) {
  if (!FileSystem.documentDirectory) return;
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    await FileSystem.writeAsStringAsync(
      cacheFilePath(region),
      JSON.stringify({ ...snapshot, savedAt: Date.now() }),
    );
  } catch {
    // Cache writes are best-effort and should never block the dashboard.
  }
}
