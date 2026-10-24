import { API_URL, APP_TEST_TOKEN } from '../config/runtime';
import type { CalendarEvent } from '../types/calendar';
import type { OutfitRecommendation, OutfitSensitivity } from '../types/outfit';
import type { RegionState } from '../types/region';

type QueryValue = string | number | boolean | null | undefined;

const baseUrl = API_URL.replace(/\/$/, '');
const FETCH_TIMEOUT_MS = 15000;

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(path: string, status: number) {
    super(`${path} API ${status}`);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

function buildUrl(path: string, params?: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) query.set(key, String(value));
  });
  const suffix = query.toString();
  return `${baseUrl}${path}${suffix ? `?${suffix}` : ''}`;
}

function withTestTokenHeaders(init?: RequestInit): RequestInit {
  if (!APP_TEST_TOKEN) return init ?? {};
  const headers = new Headers(init?.headers);
  headers.set('X-App-Test-Token', APP_TEST_TOKEN);
  return { ...init, headers };
}

async function fetchJson<T>(path: string, params?: Record<string, QueryValue>, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  init?.signal?.addEventListener('abort', abortFromParent);
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl(path, params), {
      ...withTestTokenHeaders(init),
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiHttpError(path, response.status);
    // 본문을 다 받을 때까지 기다려야 시간 제한이 본문에도 걸린다(헤더만 오고 멈추는 응답).
    return await response.json();
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener('abort', abortFromParent);
  }
}

async function fetchOptionalJson<T>(path: string, params?: Record<string, QueryValue>): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(buildUrl(path, params), {
      ...withTestTokenHeaders(),
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new ApiHttpError(path, response.status);
    // 본문을 다 받을 때까지 기다려야 시간 제한이 본문에도 걸린다(헤더만 오고 멈추는 응답).
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function getCurrentDust(region: RegionState) {
  return fetchJson<{ item?: unknown; notice?: string }>('/dust/current/', {
    city: region.city,
    region: region.region,
  });
}

export function getOptionalCurrentDust(region: RegionState) {
  return fetchOptionalJson<{ item?: unknown; notice?: string }>('/dust/current/', {
    city: region.city,
    region: region.region,
  });
}

export function getPrediction(region: RegionState) {
  return fetchJson<unknown>('/dust/predict/', {
    city: region.city,
    region: region.region,
  });
}

export function getPastDust(params: { region: RegionState; startDate: string; endDate: string }) {
  return fetchJson<{ items?: unknown[] }>('/dust/past/', {
    city: params.region.city,
    region: params.region.region,
    startDate: params.startDate,
    endDate: params.endDate,
  });
}

export function getHourlyDust(params: { region: RegionState; date: string }) {
  return fetchOptionalJson<{ items?: unknown[]; forecastItems?: unknown[] }>('/dust/hourly/', {
    city: params.region.city,
    region: params.region.region,
    date: params.date,
  });
}

export function getKoreaStations() {
  return fetchJson<{ items?: unknown[] }>('/dust/korea-stations/');
}

export function searchNaverPlaces(params: { query: string; size?: number }) {
  return fetchOptionalJson<{ items?: unknown[] }>('/dust/places/naver-search/', {
    query: params.query,
    size: params.size,
  });
}

export type MemoEventPlace = { address?: string; label: string; lat: number; lng: number; source: string };
export type MemoEvent = {
  activity_type: CalendarEvent['activityType'];
  date: string;
  end_date: string;
  end_time: string;
  place: MemoEventPlace | null;
  place_text: string;
  time: string;
  title: string;
};

export function postMemoEvents(params: { deviceId: string; text: string }) {
  return fetchJson<{ events?: MemoEvent[] }>('/dust/calendar/memo-events/', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': params.deviceId },
    body: JSON.stringify({ text: params.text }),
  });
}

export function getHourlyWeather(params: { lat: number; lng: number; date: string; forecastHours?: number; storedOnly?: boolean }) {
  return fetchOptionalJson<{ items?: unknown[]; forecastItems?: unknown[] }>('/dust/weather/hourly/', {
    lat: params.lat,
    lng: params.lng,
    date: params.date,
    forecast_hours: params.forecastHours,
    stored_only: params.storedOnly ? 1 : undefined,
  });
}

export function getMidTermWeather(params: { lat: number; lng: number; startDate: string; endDate: string }) {
  return fetchOptionalJson<{ items?: unknown[]; region?: unknown }>('/dust/weather/mid-term/', {
    lat: params.lat,
    lng: params.lng,
    startDate: params.startDate,
    endDate: params.endDate,
  });
}

export function registerNotificationDevice(params: {
  calendarEvents?: Array<{ date: string; time?: string }>;
  city: string;
  dustSpikeAlerts?: boolean;
  enabled: boolean;
  expoPushToken: string;
  region: string;
  weatherMorningAlerts: boolean;
}) {
  return fetchJson<{ ok?: boolean; deviceId?: number }>('/dust/notifications/register/', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calendarEvents: params.calendarEvents ?? [],
      city: params.city,
      dustSpikeAlerts: params.dustSpikeAlerts ?? false,
      enabled: params.enabled,
      expoPushToken: params.expoPushToken,
      region: params.region,
      weatherMorningAlerts: params.weatherMorningAlerts,
    }),
  });
}

function outfitSchedulePayload(event: CalendarEvent) {
  return {
    schedule_id: event.id,
    title: event.title,
    start: `${event.date}T${event.time || '00:00'}:00+09:00`,
    end: event.endTime ? `${event.endDate ?? event.date}T${event.endTime}:00+09:00` : undefined,
    activity_type: event.activityType,
    lat: event.locationLat,
    lng: event.locationLng,
    city: event.locationCity,
    region: event.locationRegion,
  };
}

export function postOutfitRecommendation(params: {
  event: CalendarEvent;
  sensitivity: OutfitSensitivity;
  signal?: AbortSignal;
}) {
  return fetchJson<OutfitRecommendation>('/outfit/recommend/', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      ...outfitSchedulePayload(params.event),
      sensitivity: params.sensitivity,
    }),
  });
}

export function postDailyOutfitRecommendation(params: {
  events: CalendarEvent[];
  sensitivity: OutfitSensitivity;
  signal?: AbortSignal;
}) {
  return fetchJson<OutfitRecommendation>('/outfit/daily/', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      schedules: params.events.map(outfitSchedulePayload),
      sensitivity: params.sensitivity,
    }),
  });
}
