import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import { parseStoredCalendarEvents } from '../components/calendar/calendarStorage';
import {
  CALENDAR_EVENTS_STORAGE_KEY,
  CALENDAR_TIP_SEEN_STORAGE_KEY,
  CALENDAR_NOTIFICATION_IDS_STORAGE_KEY,
  DEFAULT_OUTFIT_SETTINGS,
  DEVICE_ID_STORAGE_KEY,
  FAVORITE_REGIONS_STORAGE_KEY,
  GPS_REGION_STORAGE_KEY,
  MAP_RECENT_SEARCHES_STORAGE_KEY,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  NOTIFICATION_TOKEN_STORAGE_KEY,
  OUTFIT_SETTINGS_STORAGE_KEY,
  SELECTED_REGION_STORAGE_KEY,
  TUTORIAL_SEEN_STORAGE_KEY,
} from '../constants/dust';
import type { CalendarEvent } from '../types/calendar';
import type { StationDustItem } from '../types/dust';
import type { OutfitSettings } from '../types/outfit';
import type { RegionState } from '../types/region';
import type { NotificationSettings } from '../types/settings';
import { parseStoredFavoriteRegions, parseStoredMapRecentSearches, parseStoredNotificationSettings, parseStoredRegion } from './parseStoredValues';

export type StoredAppState = {
  calendarEvents: CalendarEvent[];
  favoriteRegions: RegionState[];
  gpsRegion: RegionState | null;
  mapRecentSearches: StationDustItem[];
  notificationSettings: NotificationSettings;
  notificationToken: string | null;
  outfitSettings: OutfitSettings;
  selectedRegion: RegionState | null;
  tutorialSeen: boolean;
  calendarTipSeen: boolean;
};

// 보안 저장소(SecureStore)는 토큰 같은 작은 비밀값용입니다(값 하나 2KB 제한).
// 일정·최근 검색·설정처럼 크거나 비밀이 아닌 값은 앱 전용 폴더의 파일에 저장합니다.
const SECURE_KEYS = new Set<string>([NOTIFICATION_TOKEN_STORAGE_KEY]);
const STORAGE_DIR = `${FileSystem.documentDirectory ?? ''}app-storage`;

function storageFilePath(key: string) {
  return `${STORAGE_DIR}/${key.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;
}

async function ensureStorageDir() {
  const info = await FileSystem.getInfoAsync(STORAGE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(STORAGE_DIR, { intermediates: true });
}

// 임시 파일에 다 쓴 뒤 바꿔 끼워서, 쓰는 도중 앱이 꺼져도 반쯤 쓴 파일이 남지 않게 합니다.
async function writeFileAtomic(path: string, value: string) {
  await ensureStorageDir();
  const temporaryPath = `${path}.tmp`;
  await FileSystem.writeAsStringAsync(temporaryPath, value);
  await FileSystem.deleteAsync(path, { idempotent: true });
  await FileSystem.moveAsync({ from: temporaryPath, to: path });
}

// 같은 키를 빠르게 여러 번 저장해도 마지막 값이 남도록 키마다 순서대로 씁니다.
const writeQueues = new Map<string, Promise<void>>();

async function safeGet(key: string) {
  if (SECURE_KEYS.has(key) || !FileSystem.documentDirectory) return SecureStore.getItemAsync(key).catch(() => null);
  const path = storageFilePath(key);
  try {
    if ((await FileSystem.getInfoAsync(path)).exists) return await FileSystem.readAsStringAsync(path);
    // 바꿔 끼우는 도중(옛 파일 삭제 후, 새 파일 이동 전)에 꺼졌다면 임시 파일이 최신 값입니다.
    if ((await FileSystem.getInfoAsync(`${path}.tmp`)).exists) return await FileSystem.readAsStringAsync(`${path}.tmp`);
  } catch (caught) {
    console.warn(`저장된 값을 읽지 못했습니다: ${key}`, caught);
    return null;
  }
  // 예전 버전은 모든 값을 SecureStore에 저장했습니다. 처음 한 번 파일로 옮기고, 옮긴 뒤에만 지웁니다.
  const legacy = await SecureStore.getItemAsync(key).catch(() => null);
  if (legacy !== null) {
    try {
      await writeFileAtomic(path, legacy);
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch (caught) {
      console.warn(`예전 저장값을 파일로 옮기지 못했습니다: ${key}`, caught);
    }
  }
  return legacy;
}

function saveString(key: string, value: string) {
  if (SECURE_KEYS.has(key) || !FileSystem.documentDirectory) {
    return SecureStore.setItemAsync(key, value).catch((caught) => console.warn(`저장하지 못했습니다: ${key}`, caught));
  }
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous
    .then(() => writeFileAtomic(storageFilePath(key), value))
    .catch((caught) => console.warn(`저장하지 못했습니다: ${key}`, caught));
  writeQueues.set(key, next);
  return next;
}

let deviceIdPromise: Promise<string> | null = null;

// 메모로 일정 추가의 하루 사용 횟수를 기기별로 세는 데만 쓰는 임의 값입니다(서버에는 해시로만 남습니다).
export function loadDeviceId() {
  deviceIdPromise ??= safeGet(DEVICE_ID_STORAGE_KEY).then(async (stored) => {
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
    const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    await saveString(DEVICE_ID_STORAGE_KEY, id);
    return id;
  });
  return deviceIdPromise;
}

function saveJson(key: string, value: unknown) {
  return saveString(key, JSON.stringify(value));
}

// One loader owns the storage keys and recovery rules for app startup.
export async function loadStoredAppState(): Promise<StoredAppState> {
  const [storedRegion, storedGpsRegion, storedFavorites, storedMapRecentSearches, storedNotificationSettings, storedCalendarEvents, notificationToken, storedOutfitSettings, storedTutorialSeen, storedCalendarTipSeen] = await Promise.all([
    safeGet(SELECTED_REGION_STORAGE_KEY),
    safeGet(GPS_REGION_STORAGE_KEY),
    safeGet(FAVORITE_REGIONS_STORAGE_KEY),
    safeGet(MAP_RECENT_SEARCHES_STORAGE_KEY),
    safeGet(NOTIFICATION_SETTINGS_STORAGE_KEY),
    safeGet(CALENDAR_EVENTS_STORAGE_KEY),
    safeGet(NOTIFICATION_TOKEN_STORAGE_KEY),
    safeGet(OUTFIT_SETTINGS_STORAGE_KEY),
    safeGet(TUTORIAL_SEEN_STORAGE_KEY),
    safeGet(CALENDAR_TIP_SEEN_STORAGE_KEY),
  ]);

  let outfitSettings = DEFAULT_OUTFIT_SETTINGS;
  try {
    const parsed = JSON.parse(storedOutfitSettings ?? '{}') as Partial<OutfitSettings>;
    outfitSettings = {
      enabled: parsed.enabled !== false,
      figure: parsed.figure === 'female' ? 'female' : 'male',
      sensitiveMode: parsed.sensitiveMode === true,
      sensitivity: ['cold', 'normal', 'hot'].includes(parsed.sensitivity ?? '') ? parsed.sensitivity as OutfitSettings['sensitivity'] : 'normal',
    };
  } catch {
    outfitSettings = DEFAULT_OUTFIT_SETTINGS;
  }

  return {
    calendarEvents: parseStoredCalendarEvents(storedCalendarEvents),
    favoriteRegions: parseStoredFavoriteRegions(storedFavorites),
    gpsRegion: parseStoredRegion(storedGpsRegion),
    mapRecentSearches: parseStoredMapRecentSearches(storedMapRecentSearches),
    notificationSettings: parseStoredNotificationSettings(storedNotificationSettings),
    notificationToken,
    outfitSettings,
    selectedRegion: parseStoredRegion(storedRegion),
    tutorialSeen: await loadTutorialSeen(storedTutorialSeen, storedRegion),
    // 캘린더 첫 방문 말풍선도 튜토리얼이 생기기 전부터 쓰던 사람에게는 띄우지 않는다.
    calendarTipSeen: storedCalendarTipSeen === 'true' || (storedTutorialSeen === null && storedRegion !== null),
  };
}

export function saveCalendarTipSeen() {
  return saveString(CALENDAR_TIP_SEEN_STORAGE_KEY, 'true');
}

// 'true'는 다 봄, 'pending'은 새로 설치했고 아직 다 보지 않음.
// 값이 없는데 저장된 지역이 있으면 튜토리얼이 생기기 전부터 쓰던 사람이라 본 것으로 친다.
// 새로 설치한 사람은 첫 실행에서 바로 'pending'을 남겨서, 튜토리얼 중간에 앱을 꺼도(지역은 이미 저장됨) 다음에 다시 뜨게 한다.
async function loadTutorialSeen(stored: string | null, storedRegion: string | null) {
  if (stored === 'true') return true;
  if (stored === 'pending') return false;
  if (storedRegion !== null) return true;
  await saveString(TUTORIAL_SEEN_STORAGE_KEY, 'pending');
  return false;
}

export function saveTutorialSeen() {
  return saveString(TUTORIAL_SEEN_STORAGE_KEY, 'true');
}

export function saveSelectedRegion(region: RegionState) {
  return saveJson(SELECTED_REGION_STORAGE_KEY, region);
}

export function saveGpsRegion(region: RegionState) {
  return saveJson(GPS_REGION_STORAGE_KEY, region);
}

export function saveFavoriteRegions(regions: RegionState[]) {
  return saveJson(FAVORITE_REGIONS_STORAGE_KEY, regions);
}

export function saveMapRecentSearches(searches: StationDustItem[]) {
  return saveJson(MAP_RECENT_SEARCHES_STORAGE_KEY, searches);
}

export function saveNotificationSettings(settings: NotificationSettings) {
  return saveJson(NOTIFICATION_SETTINGS_STORAGE_KEY, settings);
}

export function saveOutfitSettings(settings: OutfitSettings) {
  return saveJson(OUTFIT_SETTINGS_STORAGE_KEY, settings);
}

export function saveNotificationToken(token: string) {
  return saveString(NOTIFICATION_TOKEN_STORAGE_KEY, token);
}

export function saveCalendarEvents(events: CalendarEvent[]) {
  return saveJson(CALENDAR_EVENTS_STORAGE_KEY, events);
}

export async function loadCalendarNotificationIds() {
  const storedIds = await safeGet(CALENDAR_NOTIFICATION_IDS_STORAGE_KEY);
  try {
    const parsed = JSON.parse(storedIds ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCalendarNotificationIds(ids: string[]) {
  return saveJson(CALENDAR_NOTIFICATION_IDS_STORAGE_KEY, ids);
}
