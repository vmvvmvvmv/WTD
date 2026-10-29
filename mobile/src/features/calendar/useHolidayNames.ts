import { useEffect, useSyncExternalStore } from 'react';

import { getHolidays } from '../../api/dustEndpoints';
import { loadHolidayCache, saveHolidayCache } from '../../storage/appStorage';
import { parseHolidayCache, parseHolidayItems, replaceHolidayYear } from './holidayData';

// 대한민국 공휴일 {YYYY-MM-DD: 이름}. 달력 화면들이 같은 값을 나눠 씁니다.
// 앱을 켠 뒤 해마다 한 번만 서버에 묻고, 받은 값은 휴대폰에 저장해 서버가 안 될 때도 씁니다.
let holidayNames: Record<string, string> = {};
const listeners = new Set<() => void>();
const requestedYears = new Set<number>();
let cachePromise: Promise<void> | null = null;

function publish(next: Record<string, string>) {
  holidayNames = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function loadCache() {
  cachePromise ??= loadHolidayCache().then((stored) => publish({ ...parseHolidayCache(stored), ...holidayNames }));
  return cachePromise;
}

async function ensureHolidayYear(year: number) {
  if (requestedYears.has(year)) return;
  requestedYears.add(year);
  await loadCache();
  try {
    const fresh = parseHolidayItems((await getHolidays(year)).items);
    // 아직 발표 전이라 비어 있으면 저장된 값을 그대로 씁니다.
    if (!Object.keys(fresh).length) return;
    const next = replaceHolidayYear(holidayNames, year, fresh);
    publish(next);
    void saveHolidayCache(next);
  } catch {
    // 다음에 그해 달력을 열 때 다시 묻습니다.
    requestedYears.delete(year);
  }
}

export function useHolidayNames(year: number) {
  const names = useSyncExternalStore(subscribe, () => holidayNames);
  useEffect(() => {
    if (Number.isFinite(year)) void ensureHolidayYear(year);
  }, [year]);
  return names;
}
