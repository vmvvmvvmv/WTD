import type { DataMetricKey, NotificationSettings, TabKey } from '../types/dust';

// Default region used before GPS is available.
export const DEFAULT_CITY = '\uC11C\uC6B8';
export const DEFAULT_REGION = '\uC1A1\uD30C\uAD6C';
export const DEFAULT_REGION_STATE = { city: DEFAULT_CITY, region: DEFAULT_REGION };

export const SELECTED_REGION_STORAGE_KEY = 'dust.selected-region';
export const GPS_REGION_STORAGE_KEY = 'dust.gps-region';
export const FAVORITE_REGIONS_STORAGE_KEY = 'dust.favorite-regions';
export const MAP_RECENT_SEARCHES_STORAGE_KEY = 'dust.map-recent-searches';
export const NOTIFICATION_SETTINGS_STORAGE_KEY = 'dust.notification-settings';
export const NOTIFICATION_TOKEN_STORAGE_KEY = 'dust.notification-token';
export const CALENDAR_EVENTS_STORAGE_KEY = 'dust.calendar-events';
export const CALENDAR_NOTIFICATION_IDS_STORAGE_KEY = 'dust.calendar-notification-ids';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  calendarReminders: true,
  weatherMorningAlerts: false,
  // TODO: Favorites-included notifications are marked for possible removal.
  includeFavorites: true,
};

export const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'home', label: '\uD648' },
  { key: 'calendar', label: '\uCE98\uB9B0\uB354' },
  { key: 'account', label: '\uC124\uC815' },
];

export const dataMetrics: Array<{ key: DataMetricKey; label: string; code: string; unit: string; decimals: number }> = [
  { key: 'pm10', label: '\uBBF8\uC138\uBA3C\uC9C0', code: 'PM10', unit: '\u00B5g/m\u00B3', decimals: 0 },
  { key: 'pm25', label: '\uCD08\uBBF8\uC138\uBA3C\uC9C0', code: 'PM2.5', unit: '\u00B5g/m\u00B3', decimals: 0 },
  { key: 'o3', label: '\uC624\uC874', code: 'O3', unit: 'ppm', decimals: 3 },
  { key: 'no2', label: '\uC774\uC0B0\uD654\uC9C8\uC18C', code: 'NO2', unit: 'ppm', decimals: 3 },
];

export const dataRanges = [
  { label: '1\uAC1C\uC6D4', days: 30 },
  { label: '3\uAC1C\uC6D4', days: 90 },
  { label: '6\uAC1C\uC6D4', days: 180 },
];

export const DATA_LIST_PAGE_SIZE = 14;
