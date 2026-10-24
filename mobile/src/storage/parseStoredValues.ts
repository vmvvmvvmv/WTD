import { DEFAULT_NOTIFICATION_SETTINGS } from '../constants/dust';
import type { StationDustItem } from '../types/dust';
import type { RegionState } from '../types/region';
import type { NotificationSettings } from '../types/settings';

// 저장된 JSON을 앱 상태로 안전하게 되살립니다(형식이 틀리면 기본값).
// 선택 지역.
export function parseStoredRegion(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RegionState>;
    if (typeof parsed.city === 'string' && typeof parsed.region === 'string' && parsed.city && parsed.region) {
      return { city: parsed.city, region: parsed.region, label: typeof parsed.label === 'string' ? parsed.label : undefined };
    }
  } catch {
    return null;
  }
  return null;
}

// 즐겨찾기 지역(최대 15곳).
export function parseStoredFavoriteRegions(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Partial<RegionState>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => !!item && typeof item.city === 'string' && typeof item.region === 'string' && item.city && item.region)
      .map((item) => ({ city: item.city as string, region: item.region as string, label: typeof item.label === 'string' ? item.label : undefined }))
      .slice(0, 15);
  } catch {
    return [];
  }
}

// 지도 최근 검색(최대 8개).
export function parseStoredMapRecentSearches(value: string | null): StationDustItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Partial<StationDustItem>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => !!item && typeof item.sido === 'string' && (typeof item.name === 'string' || typeof item.city === 'string') && typeof item.lat === 'number' && typeof item.lng === 'number')
      .map((item) => ({
        addr: typeof item.addr === 'string' ? item.addr : undefined,
        city: typeof item.city === 'string' ? item.city : undefined,
        lat: item.lat as number,
        lng: item.lng as number,
        name: typeof item.name === 'string' ? item.name : undefined,
        sido: item.sido as string,
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

// 알림 설정. 빠진 값은 기본값으로 채웁니다.
export function parseStoredNotificationSettings(value: string | null): NotificationSettings {
  if (!value) return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    const isLegacyDisabledDefault = parsed.enabled === false
      && parsed.calendarReminders !== false
      && parsed.weatherMorningAlerts !== true
      && parsed.includeFavorites !== false;
    if (isLegacyDisabledDefault) return DEFAULT_NOTIFICATION_SETTINGS;
    return {
      enabled: parsed.enabled !== false,
      calendarReminders: parsed.calendarReminders !== false,
      weatherMorningAlerts: parsed.weatherMorningAlerts !== false,
      dustSpikeAlerts: parsed.dustSpikeAlerts !== false,
      // TODO: 즐겨찾기 지역까지 알림에 넣는 기능. 필요 없으면 지울 후보.
      includeFavorites: parsed.includeFavorites !== false,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}
