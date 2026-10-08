import type { CalendarEvent, OutfitRecommendation, OutfitSensitivity } from '../../types/dust';

const memoryCache = new Map<string, OutfitRecommendation>();

export function outfitCacheKey(eventId: string, date: string, time: string, sensitivity: OutfitSensitivity, locationKey = '') {
  return `${eventId}:${date}:${time}:${sensitivity}:${locationKey}`;
}

export function outfitCacheKeyForEvents(events: CalendarEvent[], sensitivity: OutfitSensitivity) {
  const eventKey = events.map((event) => [
    // 제목은 서버의 일정 성격(occasion) 판정과 안내 문구에 쓰이므로 키에 포함합니다.
    event.id, event.title, event.date, event.time, event.endDate ?? '', event.endTime ?? '', event.activityType,
    event.locationCity ?? '', event.locationRegion ?? '', event.locationLat ?? '', event.locationLng ?? '',
  ].join(':')).join('|');
  return `daily:${sensitivity}:${eventKey}`;
}

export function getCachedOutfit(key: string) {
  const cached = memoryCache.get(key);
  if (!cached || new Date(cached.valid_until).getTime() <= Date.now()) return null;
  return cached;
}

export function getLastOutfit(key: string) {
  return memoryCache.get(key) ?? null;
}

export function setCachedOutfit(key: string, value: OutfitRecommendation) {
  memoryCache.set(key, value);
}

export function clearCachedOutfit(key: string) {
  memoryCache.delete(key);
}
