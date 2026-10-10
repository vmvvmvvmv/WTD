import { useEffect, useState } from 'react';
import { getHourlyDust, getHourlyWeather, getMidTermWeather, getOptionalCurrentDust, getPrediction } from '../../api/dustEndpoints';
import type { CalendarLocationForecast } from '../../components/calendar/calendarForecast';
import { calendarEventLocationKey } from '../../components/calendar/calendarLocation';
import type { CalendarEvent } from '../../types/calendar';
import type { CurrentDustItem } from '../../types/dust';
import type { WeatherHourlyItem, WeatherMidTermItem } from '../../types/weather';
import { normalizePredictionResponse } from '../dashboard/predictionResponse';
import { addDays, toCompactDate } from '../../utils/date';
import { toNumber } from '../../utils/format';
import { buildDashboardHourlyItems, buildDashboardWeatherHourlyItems } from '../dashboard/dashboardData';
import { weatherStateFromHourlyItem } from '../weather/weatherData';

async function loadCalendarLocationForecast(event: CalendarEvent, todayDateLabel: string): Promise<[string, CalendarLocationForecast] | null> {
  const key = calendarEventLocationKey(event);
  if (!key || typeof event.locationLat !== 'number' || typeof event.locationLng !== 'number') return null;

  const todayCompact = toCompactDate(new Date());
  const midTermEndCompact = toCompactDate(addDays(new Date(), 14));
  const region = event.locationCity && event.locationRegion
    ? { city: event.locationCity, label: event.location, region: event.locationRegion }
    : null;

  const [weatherHourlyData, midTermData, hourlyDustData, predictionData, currentDustData] = await Promise.all([
    getHourlyWeather({ date: todayCompact, forecastHours: 72, lat: event.locationLat, lng: event.locationLng }),
    getMidTermWeather({ endDate: midTermEndCompact, lat: event.locationLat, lng: event.locationLng, startDate: todayCompact }),
    region ? getHourlyDust({ date: todayCompact, region }) : Promise.resolve(null),
    region ? getPrediction(region).catch(() => null) : Promise.resolve(null),
    region ? getOptionalCurrentDust(region) : Promise.resolve(null),
  ]);

  const weatherStoredItems = Array.isArray(weatherHourlyData?.items) ? weatherHourlyData.items as WeatherHourlyItem[] : [];
  const currentWeather = weatherStateFromHourlyItem(weatherStoredItems[weatherStoredItems.length - 1]);
  const currentDustItem = currentDustData?.item as CurrentDustItem | undefined;
  return [key, {
    currentPm10: toNumber(currentDustItem?.pm10Value),
    dustItems: buildDashboardHourlyItems(hourlyDustData, currentDustItem ?? null, todayDateLabel),
    prediction: normalizePredictionResponse(predictionData),
    weather: currentWeather,
    weatherHourlyItems: buildDashboardWeatherHourlyItems(weatherHourlyData, currentWeather, todayDateLabel),
    weatherMidTermItems: Array.isArray(midTermData?.items) ? midTermData.items as WeatherMidTermItem[] : [],
  }];
}

// 서버는 매시 예보를 새로 모으므로, 앱을 켜 둔 동안에도 이 간격으로 장소별 예보를 다시 받습니다.
const LOCATION_FORECAST_REFRESH_MS = 10 * 60 * 1000;

// 장소 중복 제거와 이전 요청 결과 무시를 이 훅에서 관리합니다.
export function useCalendarLocationForecasts(
  calendarEvents: CalendarEvent[],
  hasLoadedRegionStore: boolean,
  todayDateLabel: string,
) {
  const [calendarLocationForecasts, setCalendarLocationForecasts] = useState<Record<string, CalendarLocationForecast>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), LOCATION_FORECAST_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    let cancelled = false;
    const eventsWithLocation = calendarEvents.filter((event) => !!calendarEventLocationKey(event));
    const uniqueEvents = Array.from(new Map(eventsWithLocation.map((event) => [calendarEventLocationKey(event), event])).values());
    const activeKeys = new Set(uniqueEvents.map((event) => calendarEventLocationKey(event)));
    // 더 이상 없는 장소만 지우고, 남은 장소는 새 예보가 올 때까지 이전 값을 유지합니다.
    setCalendarLocationForecasts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => activeKeys.has(key))));

    // 장소마다 받는 대로 바로 반영합니다(가장 느린 장소를 기다리지 않음).
    uniqueEvents.forEach((event) => {
      loadCalendarLocationForecast(event, todayDateLabel)
        .then((entry) => {
          if (cancelled || !entry) return;
          setCalendarLocationForecasts((current) => ({ ...current, [entry[0]]: entry[1] }));
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
    };
  }, [calendarEvents, hasLoadedRegionStore, refreshTick, todayDateLabel]);

  return calendarLocationForecasts;
}
