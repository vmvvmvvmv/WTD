import { useEffect, useState } from 'react';
import { getHourlyDust, getHourlyWeather, getMidTermWeather, getOptionalCurrentDust, getPrediction } from '../../api/dustEndpoints';
import type { CalendarLocationForecast } from '../../components/calendar/calendarForecast';
import { calendarEventLocationKey } from '../../components/calendar/calendarLocation';
import type { CalendarEvent, CurrentDustItem, WeatherHourlyItem, WeatherMidTermItem } from '../../types/dust';
import { addDays, normalizePredictionResponse, toCompactDate, toNumber } from '../../utils/dust';
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

// 장소 중복 제거와 이전 요청 결과 무시를 이 훅에서 관리합니다.
export function useCalendarLocationForecasts(
  calendarEvents: CalendarEvent[],
  hasLoadedRegionStore: boolean,
  todayDateLabel: string,
) {
  const [calendarLocationForecasts, setCalendarLocationForecasts] = useState<Record<string, CalendarLocationForecast>>({});

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    let cancelled = false;
    const eventsWithLocation = calendarEvents.filter((event) => !!calendarEventLocationKey(event));
    const uniqueEvents = Array.from(new Map(eventsWithLocation.map((event) => [calendarEventLocationKey(event), event])).values());
    if (uniqueEvents.length === 0) {
      setCalendarLocationForecasts({});
      return;
    }

    Promise.all(uniqueEvents.map((event) => loadCalendarLocationForecast(event, todayDateLabel).catch(() => null))).then((entries) => {
      if (cancelled) return;
      setCalendarLocationForecasts(Object.fromEntries(entries.filter((entry): entry is [string, CalendarLocationForecast] => !!entry)));
    });

    return () => {
      cancelled = true;
    };
  }, [calendarEvents, hasLoadedRegionStore, todayDateLabel]);

  return calendarLocationForecasts;
}
