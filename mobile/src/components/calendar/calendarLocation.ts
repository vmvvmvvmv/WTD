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
