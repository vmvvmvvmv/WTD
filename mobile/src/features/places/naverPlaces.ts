import { haversineKm } from '../../utils/geo';

// 서버의 네이버 장소 검색(/dust/places/naver-search/) 응답 한 줄. 이름·좌표가 없는 항목은 버립니다.
// source가 naver_geocode면 주소 검색 결과(친 주소 그대로라 맨 앞에 둠), 아니면 장소 검색 결과.
export type NaverPlace = {
  address?: string;
  category?: string;
  label: string;
  lat: number;
  lng: number;
  link?: string;
  source?: string;
};

export function parseNaverPlaceItems(items: unknown): NaverPlace[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const place = item && typeof item === 'object' ? item as Record<string, unknown> : null;
    if (!place || typeof place.label !== 'string' || !place.label || typeof place.lat !== 'number' || typeof place.lng !== 'number') return [];
    return [{
      address: typeof place.address === 'string' ? place.address : undefined,
      category: typeof place.category === 'string' ? place.category : undefined,
      label: place.label,
      lat: place.lat,
      lng: place.lng,
      link: typeof place.link === 'string' ? place.link : undefined,
      source: typeof place.source === 'string' ? place.source : undefined,
    }];
  });
}

const compactName = (value: string) => value.replace(/\s/g, '').toLowerCase();

// 기준 좌표에서 가까운 순으로. 주소 검색 결과가 맨 앞, 그다음 이름이 검색어와 똑같은 장소('코엑스'로 찾은 '코엑스'),
// 나머지는 가까운 순, 좌표가 없는 항목은 맨 뒤, 거리가 같으면 원래 순서.
// 이름이 똑같은 장소를 앞에 두는 건, 먼 곳의 유명한 장소가 주변에서 다시 찾은 비슷한 이름(예: '부산코엑스콜밴')에 밀리지 않게 하려고.
export function sortByDistanceFrom<T extends { label?: string; lat?: number; lng?: number; source?: string }>(items: T[], origin?: { lat: number; lng: number } | null, query?: string): T[] {
  if (!origin) return items;
  const exact = query ? compactName(query) : '';
  const rank = (item: T) => {
    if (item.source === 'naver_geocode') return -2;
    if (exact && item.label && compactName(item.label) === exact) return -1;
    return typeof item.lat === 'number' && typeof item.lng === 'number' ? haversineKm(origin.lat, origin.lng, item.lat, item.lng) : Infinity;
  };
  return items
    .map((item, index) => ({ index, item, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

// 검색 기준 위치. areaName은 '부산 대신동'처럼 검색어 앞에 붙일 지역 이름(없으면 다시 찾지 않음).
export type SearchNear = { areaName?: string; lat: number; lng: number };

// 이보다 멀면 '내 근처 결과가 아니다'로 봅니다.
export const LOCAL_SEARCH_FAR_KM = 30;

// 주소 결과를 뺀 장소가 하나도 없거나 모두 멀면, 지역 이름을 붙여 다시 찾아야 합니다.
export function needsLocalSearch(places: NaverPlace[], near: { lat: number; lng: number }) {
  const spots = places.filter((place) => place.source !== 'naver_geocode');
  return spots.every((place) => haversineKm(near.lat, near.lng, place.lat, place.lng) > LOCAL_SEARCH_FAR_KM);
}

// 두 검색 결과를 합치되 같은 장소(이름·좌표가 같음)는 한 번만.
export function mergePlaces(first: NaverPlace[], second: NaverPlace[]) {
  const seen = new Set<string>();
  return [...first, ...second].filter((place) => {
    const key = `${place.label}|${place.lat.toFixed(5)}|${place.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 다시 찾을 때 붙일 지역 이름: 좁은 것부터('부산 대신동' → '부산'). 대신동에 CGV가 없으면 부산 전체에서 찾게.
export function localAreaNames(areaName?: string) {
  const words = (areaName ?? '').trim().split(/\s+/).filter(Boolean);
  return [...new Set([words.join(' '), words[0]].filter(Boolean))];
}
