// 서버의 네이버 장소 검색(/dust/places/naver-search/) 응답 한 줄. 이름·좌표가 없는 항목은 버립니다.
export type NaverPlace = {
  address?: string;
  category?: string;
  label: string;
  lat: number;
  lng: number;
  link?: string;
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
    }];
  });
}
