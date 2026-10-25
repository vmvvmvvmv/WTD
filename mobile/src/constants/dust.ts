import type { OutfitSettings } from '../types/outfit';
import type { NotificationSettings } from '../types/settings';

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
export const OUTFIT_SETTINGS_STORAGE_KEY = 'dust.outfit-settings';
export const CALENDAR_EVENTS_STORAGE_KEY = 'dust.calendar-events';
export const CALENDAR_NOTIFICATION_IDS_STORAGE_KEY = 'dust.calendar-notification-ids';
export const TUTORIAL_SEEN_STORAGE_KEY = 'dust.tutorial-seen';
export const CALENDAR_TIP_SEEN_STORAGE_KEY = 'dust.calendar-tip-seen';
export const DEVICE_ID_STORAGE_KEY = 'dust.device-id';
export const MEMO_HISTORY_STORAGE_KEY = 'dust.memo-history';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  calendarReminders: true,
  weatherMorningAlerts: true,
  dustSpikeAlerts: true,
  weatherWarningAlerts: true,
  // TODO: Favorites-included notifications are marked for possible removal.
  includeFavorites: true,
};

export const DEFAULT_OUTFIT_SETTINGS: OutfitSettings = {
  enabled: true,
  figure: 'male',
  sensitiveMode: false,
  sensitivity: 'normal',
};
