import { getOptionalCurrentDust } from '../api/dustEndpoints';
import { isDateInEventRange } from '../components/calendar/calendarUtils';
import { weatherIconKind, type WeatherIconKind } from '../components/shared/WeatherIcon';
import { getAirQualityGrade, getAirQualityMeta, type AirQualityGrade } from '../features/airQuality/airQualityGrade';
import { fetchDashboardWeather } from '../features/dashboard/dashboardService';
import { loadStoredAppState } from '../storage/appStorage';
import type { CalendarEvent } from '../types/calendar';
import type { CurrentDustItem } from '../types/dust';
import type { WeatherHourlyItem } from '../types/weather';
import { toIsoDate } from '../utils/date';
import { toNumber } from '../utils/format';

export type WidgetHour = {
  kind: WeatherIconKind;
  rainProbability?: number;
  temperature?: number;
  timeLabel: string;
};

export type WidgetData = {
  dustGrade: AirQualityGrade;
  dustLabel: string;
  dustValue?: number;
  events: CalendarEvent[];
  hours: WidgetHour[];
  regionLabel: string;
  temperature?: number;
  weatherKind: WeatherIconKind;
  weatherLabel: string;
};

const HOUR_STEP = 3;
const HOUR_COUNT = 5;

// 지금부터 3시간 간격으로 5칸(지금, +3시, ... +12시)을 고릅니다. 예보가 모자라면 있는 만큼만 보여 줍니다.
function pickHours(items: WeatherHourlyItem[]): WidgetHour[] {
  return Array.from({ length: HOUR_COUNT }, (_, index) => items[index * HOUR_STEP])
    .flatMap((item, index) => {
      if (!item) return [];
      const time = item.hour?.slice(0, 5) || item.measuredAt?.slice(11, 16) || '';
      return [{
        kind: weatherIconKind(item.label),
        rainProbability: toNumber(item.rain_probability),
        temperature: toNumber(item.temperature),
        timeLabel: index === 0 ? '지금' : `${Number(time.slice(0, 2))}시`,
      }];
    });
}

// 위젯 갱신 때마다 실행됩니다. 일부 요청이 실패해도 나머지는 보여 주려고 항목별로 따로 받습니다.
export async function loadWidgetData(): Promise<WidgetData | null> {
  const state = await loadStoredAppState();
  const region = state.selectedRegion ?? state.gpsRegion;
  if (!region) return null;

  const today = toIsoDate(new Date());
  const events = state.calendarEvents
    .filter((event) => isDateInEventRange(today, event))
    .sort((a, b) => a.time.localeCompare(b.time));

  const [weatherResult, dustResult] = await Promise.allSettled([
    fetchDashboardWeather(region, today, []),
    getOptionalCurrentDust(region),
  ]);

  const dustItem = dustResult.status === 'fulfilled' ? dustResult.value?.item as CurrentDustItem | undefined : undefined;
  const dustValue = toNumber(dustItem?.pm10Value);
  const weatherData = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const weather = weatherData?.weather;
  return {
    dustGrade: getAirQualityGrade('pm10', dustValue),
    dustLabel: getAirQualityMeta('pm10', dustValue).label,
    dustValue,
    events,
    hours: pickHours(weatherData?.hourlyItems ?? []),
    regionLabel: region.label || region.region,
    temperature: weather?.temperature,
    weatherKind: weatherIconKind(weather?.label, weather?.windSpeed),
    weatherLabel: weather?.label ?? '',
  };
}
