import * as SecureStore from 'expo-secure-store';

import { parseStoredCalendarEvents } from '../components/calendar/calendarStorage';
import {
  CALENDAR_EVENTS_STORAGE_KEY,
  CALENDAR_NOTIFICATION_IDS_STORAGE_KEY,
  FAVORITE_REGIONS_STORAGE_KEY,
  GPS_REGION_STORAGE_KEY,
  MAP_RECENT_SEARCHES_STORAGE_KEY,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  NOTIFICATION_TOKEN_STORAGE_KEY,
  SELECTED_REGION_STORAGE_KEY,
} from '../constants/dust';
import type { CalendarEvent, NotificationSettings, RegionState, StationDustItem } from '../types/dust';
import {
  parseStoredFavoriteRegions,
  parseStoredMapRecentSearches,
  parseStoredNotificationSettings,
  parseStoredRegion,
} from '../utils/dust';

export type StoredAppState = {
  calendarEvents: CalendarEvent[];
  favoriteRegions: RegionState[];
  gpsRegion: RegionState | null;
  mapRecentSearches: StationDustItem[];
  notificationSettings: NotificationSettings;
  notificationToken: string | null;
  selectedRegion: RegionState | null;
};

async function safeGet(key: string) {
  return SecureStore.getItemAsync(key).catch(() => null);
}

function saveString(key: string, value: string) {
  return SecureStore.setItemAsync(key, value).catch(() => {});
}

function saveJson(key: string, value: unknown) {
  return saveString(key, JSON.stringify(value));
}

// One loader owns the storage keys and recovery rules for app startup.
export async function loadStoredAppState(): Promise<StoredAppState> {
  const [storedRegion, storedGpsRegion, storedFavorites, storedMapRecentSearches, storedNotificationSettings, storedCalendarEvents, notificationToken] = await Promise.all([
    safeGet(SELECTED_REGION_STORAGE_KEY),
    safeGet(GPS_REGION_STORAGE_KEY),
    safeGet(FAVORITE_REGIONS_STORAGE_KEY),
    safeGet(MAP_RECENT_SEARCHES_STORAGE_KEY),
    safeGet(NOTIFICATION_SETTINGS_STORAGE_KEY),
    safeGet(CALENDAR_EVENTS_STORAGE_KEY),
    safeGet(NOTIFICATION_TOKEN_STORAGE_KEY),
  ]);

  return {
    calendarEvents: parseStoredCalendarEvents(storedCalendarEvents),
    favoriteRegions: parseStoredFavoriteRegions(storedFavorites),
    gpsRegion: parseStoredRegion(storedGpsRegion),
    mapRecentSearches: parseStoredMapRecentSearches(storedMapRecentSearches),
    notificationSettings: parseStoredNotificationSettings(storedNotificationSettings),
    notificationToken,
    selectedRegion: parseStoredRegion(storedRegion),
  };
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
