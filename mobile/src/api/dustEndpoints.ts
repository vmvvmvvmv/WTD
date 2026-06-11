import { API_URL, APP_TEST_TOKEN } from '../config/runtime';
import type { RegionState } from '../types/dust';

type QueryValue = string | number | boolean | null | undefined;

const baseUrl = API_URL.replace(/\/$/, '');

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
  const response = await fetch(buildUrl(path, params), withTestTokenHeaders(init));
  if (!response.ok) throw new Error(`${path} API ${response.status}`);
  return response.json();
}

async function fetchOptionalJson<T>(path: string, params?: Record<string, QueryValue>): Promise<T | null> {
  const response = await fetch(buildUrl(path, params), withTestTokenHeaders());
  return response.ok ? response.json() : null;
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

export function getOptionalKoreaStations() {
  return fetchOptionalJson<{ items?: unknown[] }>('/dust/korea-stations/');
}

export function searchNaverPlaces(params: { query: string; size?: number }) {
  return fetchOptionalJson<{ items?: unknown[] }>('/dust/places/naver-search/', {
    query: params.query,
    size: params.size,
  });
}

export function getCurrentWeather(params: { lat: number; lng: number }) {
  return fetchJson<unknown>('/dust/weather/current/', params);
}

export function getOptionalCurrentWeather(params: { lat: number; lng: number }) {
  return fetchOptionalJson<unknown>('/dust/weather/current/', params);
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

export function getPastWeather(params: { region: RegionState; startDate: string; endDate: string }) {
  return fetchOptionalJson<{ items?: unknown[]; asosStation?: unknown }>('/dust/weather/past/', {
    city: params.region.city,
    region: params.region.region,
    startDate: params.startDate,
    endDate: params.endDate,
  });
}

export function postBriefingMessage(params: {
  question: string;
  quickType?: string;
  region: RegionState;
  currentData?: unknown;
  prediction?: unknown;
  weather?: unknown;
}) {
  return fetchJson<{ answer?: string }>('/dust/chat/', undefined, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      quickType: params.quickType ?? '',
      city: params.region.city,
      region: params.region.region,
      currentData: params.currentData,
      prediction: params.prediction,
      weather: params.weather,
    }),
  });
}

export function registerNotificationDevice(params: {
  calendarEvents?: Array<{ date: string; time?: string; title: string }>;
  city: string;
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
      enabled: params.enabled,
      expoPushToken: params.expoPushToken,
      region: params.region,
      weatherMorningAlerts: params.weatherMorningAlerts,
    }),
  });
}
