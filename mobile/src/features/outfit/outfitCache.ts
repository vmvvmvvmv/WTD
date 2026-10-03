import type { OutfitRecommendation, OutfitSensitivity } from '../../types/dust';

const memoryCache = new Map<string, OutfitRecommendation>();

export function outfitCacheKey(eventId: string, date: string, time: string, sensitivity: OutfitSensitivity) {
  return `${eventId}:${date}:${time}:${sensitivity}`;
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
