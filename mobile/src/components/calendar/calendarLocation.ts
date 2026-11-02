import type { CalendarEvent } from '../../types/calendar';

export type CalendarLocationCandidate = {
  address?: string;
  category?: string;
  city?: string;
  id?: string;
  label: string;
  link?: string;
  lat: number;
  lng: number;
  region?: string;
  source: 'naver_map' | 'station' | 'manual' | string;
};

export function calendarEventLocationKey(event: CalendarEvent) {
  if (typeof event.locationLat !== 'number' || typeof event.locationLng !== 'number') return '';
  return `${event.locationSource ?? ''}:${event.locationLat.toFixed(4)}:${event.locationLng.toFixed(4)}`;
}

// 일정에 저장된 장소를 지도 선택 후보 모양으로. 좌표가 없으면 null.
export function locationCandidateFromEvent(event: CalendarEvent): CalendarLocationCandidate | null {
  if (typeof event.locationLat !== 'number' || typeof event.locationLng !== 'number') return null;
  return {
    address: event.locationAddress,
    city: event.locationCity,
    label: event.location ?? '지도 선택 위치',
    lat: event.locationLat,
    lng: event.locationLng,
    region: event.locationRegion,
    source: event.locationSource ?? 'naver_map',
  };
}

// 최근 일정에 쓴 장소(날짜가 늦은 일정부터, 이름이 같으면 한 번만). 일정 입력에서 지도를 다시 열지 않고 고르게 합니다.
export function recentLocationCandidates(events: CalendarEvent[], limit = 4): CalendarLocationCandidate[] {
  const seen = new Set<string>();
  const result: CalendarLocationCandidate[] = [];
  for (const event of [...events].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))) {
    const candidate = locationCandidateFromEvent(event);
    if (!candidate || !event.location?.trim() || seen.has(candidate.label)) continue;
    seen.add(candidate.label);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}
