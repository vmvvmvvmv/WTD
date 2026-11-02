import * as FileSystem from 'expo-file-system/legacy';

import type { StationDustItem } from '../../types/dust';

const CACHE_DIR = `${FileSystem.documentDirectory ?? ''}station-cache`;
const CACHE_FILE = `${CACHE_DIR}/korea-stations.json`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type StationCacheSnapshot = {
  items: StationDustItem[];
  savedAt: number;
};

function isStationCacheSnapshot(value: unknown): value is StationCacheSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<StationCacheSnapshot>;
  return typeof snapshot.savedAt === 'number' && Array.isArray(snapshot.items);
}

// maxAgeMs: 측정값까지 쓰면 6시간, 측정소 위치(좌표)만 쓰면 오래된 것도 괜찮아서 더 길게 줄 수 있습니다.
export async function loadStationCache(maxAgeMs = CACHE_TTL_MS) {
  if (!FileSystem.documentDirectory) return null;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (!info.exists) return null;

    const snapshot = JSON.parse(await FileSystem.readAsStringAsync(CACHE_FILE)) as unknown;
    if (!isStationCacheSnapshot(snapshot)) return null;
    if (Date.now() - snapshot.savedAt > maxAgeMs) return null;
    return snapshot.items;
  } catch {
    return null;
  }
}

export async function saveStationCache(items: StationDustItem[]) {
  if (!FileSystem.documentDirectory || items.length === 0) return;
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    await FileSystem.writeAsStringAsync(CACHE_FILE, JSON.stringify({ items, savedAt: Date.now() }));
  } catch {
    // Station cache is best-effort; startup should not depend on writing it.
  }
}
