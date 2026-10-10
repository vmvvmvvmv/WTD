import { getHourlyWeather, getMidTermWeather } from '../../api/dustEndpoints';
import type { StationDustItem } from '../../types/dust';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';
import { addDays, toCompactDate } from '../../utils/date';
import { toNumber } from '../../utils/format';
import { buildDashboardWeatherHourlyItems } from '../dashboard/dashboardData';

export function weatherStateFromHourlyItem(item?: WeatherHourlyItem): WeatherState | null {
  if (!item) return null;
  const temperature = toNumber(item.temperature);
  if (typeof temperature !== 'number') return null;
  return {
    humidity: toNumber(item.humidity),
    label: item.label || '날씨',
    measured_at: item.measuredAt,
    rainMm: toNumber(item.rain_mm),
    temperature,
    windDirection: toNumber(item.wind_direction),
    windSpeed: toNumber(item.wind_speed),
  };
}

export function weatherStateFromStation(station?: StationDustItem | null): WeatherState | null {
  if (!station) return null;
  const temperature = toNumber(station.weatherTemperature);
  if (typeof temperature !== 'number') return null;
  return {
    humidity: toNumber(station.weatherHumidity),
    label: station.weatherLabel || '날씨',
    measured_at: station.weatherTime,
    rainMm: toNumber(station.weatherRainMm),
    temperature,
    windDirection: toNumber(station.weatherWindDirection),
    windSpeed: toNumber(station.weatherWindSpeed),
  };
}

export async function loadStoredWeather(lat: number, lng: number, todayDateLabel: string) {
  const todayCompact = toCompactDate(new Date());
  const yesterdayCompact = toCompactDate(addDays(new Date(), -1));
  const midTermEndCompact = toCompactDate(addDays(new Date(), 14));
  const [weatherHourlyData, yesterdayHourlyData, midTermResult] = await Promise.all([
    getHourlyWeather({ date: todayCompact, forecastHours: 72, lat, lng }),
    getHourlyWeather({ date: yesterdayCompact, lat, lng, storedOnly: true }).catch(() => null),
    getMidTermWeather({ endDate: midTermEndCompact, lat, lng, startDate: todayCompact })
      .then((data) => ({ data, error: null as unknown }))
      .catch((error: unknown) => ({ data: null, error })),
  ]);
  if (midTermResult.error) console.warn('중기 날씨 예보를 불러오지 못했습니다.', midTermResult.error);
  const midTermData = midTermResult.data;
  const storedItems = Array.isArray(weatherHourlyData?.items) ? weatherHourlyData.items as WeatherHourlyItem[] : [];
  const forecastItems = Array.isArray(weatherHourlyData?.forecastItems) ? weatherHourlyData.forecastItems as WeatherHourlyItem[] : [];
  if (storedItems.length === 0 && forecastItems.length === 0) {
    throw new Error('선택 지역의 시간별 날씨 데이터가 없습니다.');
  }
  const currentItem = storedItems[storedItems.length - 1];
  const currentWeather = weatherStateFromHourlyItem(currentItem);
  const yesterdayItems = Array.isArray(yesterdayHourlyData?.items) ? yesterdayHourlyData.items as WeatherHourlyItem[] : [];
  const currentHour = currentItem?.hour?.slice(0, 2) ?? currentItem?.measuredAt?.slice(11, 13);
  const yesterdayItem = yesterdayItems.find((item) => (
    (item.hour?.slice(0, 2) ?? item.measuredAt?.slice(11, 13)) === currentHour
  )) ?? yesterdayItems[yesterdayItems.length - 1];
  return {
    hourlyItems: buildDashboardWeatherHourlyItems(weatherHourlyData, currentWeather, todayDateLabel),
    midTermItems: Array.isArray(midTermData?.items) ? midTermData.items as WeatherMidTermItem[] : [],
    weather: currentWeather,
    yesterdayWeather: weatherStateFromHourlyItem(yesterdayItem),
  };
}
