import type { CalendarEvent } from '../../types/dust';
import { toNumber } from '../../utils/dust';

export type CalendarLocationCandidate = {
  address?: string;
  category?: string;
  city?: string;
  id?: string;
  label: string;
  lat: number;
  lng: number;
  region?: string;
  source: 'naver_map' | 'station' | 'manual' | string;
};

export function normalizeCalendarLocationCandidate(raw: unknown): CalendarLocationCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const lat = toNumber(item.lat as string | number | null | undefined);
  const lng = toNumber(item.lng as string | number | null | undefined);
  const label = typeof item.label === 'string' ? item.label : '';
  if (!label || typeof lat !== 'number' || typeof lng !== 'number') return null;

  return {
    address: typeof item.address === 'string' ? item.address : undefined,
    category: typeof item.category === 'string' ? item.category : undefined,
    city: typeof item.city === 'string' ? item.city : undefined,
    id: typeof item.id === 'string' ? item.id : undefined,
    label,
    lat,
    lng,
    region: typeof item.region === 'string' ? item.region : label,
    source: typeof item.source === 'string' ? item.source : 'naver_map',
  };
}

export function calendarEventLocationKey(event: CalendarEvent) {
  if (typeof event.locationLat !== 'number' || typeof event.locationLng !== 'number') return '';
  return `${event.locationSource ?? ''}:${event.locationLat.toFixed(4)}:${event.locationLng.toFixed(4)}`;
}
