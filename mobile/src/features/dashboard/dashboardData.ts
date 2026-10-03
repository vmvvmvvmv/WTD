import type { CurrentDustItem, HourlyDustItem, RegionState, StationDustItem, WeatherHourlyItem, WeatherState } from '../../types/dust';

type HourlyDustResponse = {
  items?: unknown[];
  forecastItems?: unknown[];
} | null;

type HourlyWeatherResponse = {
  items?: unknown[];
  forecastItems?: unknown[];
} | null;

function currentHourItem(currentWeather: WeatherState | null, todayDateLabel: string): WeatherHourlyItem | null {
  if (currentWeather?.temperature == null) return null;

  const measuredAt = typeof currentWeather.measured_at === 'string' ? currentWeather.measured_at : '';
  const date = measuredAt.slice(0, 10) || todayDateLabel;
  const hour = measuredAt.slice(11, 16) || `${String(new Date().getHours()).padStart(2, '0')}:00`;
  return {
    measuredAt: measuredAt || `${todayDateLabel}T${hour}:00`,
    date,
    hour,
    temperature: currentWeather.temperature,
    label: currentWeather.label,
    phase: 'stored',
    source: 'current_weather',
  };
}

function weatherItemKey(item: WeatherHourlyItem) {
  const date = item.date ?? (item.measuredAt ? item.measuredAt.slice(0, 10) : '');
  const hour = item.hour ?? (item.measuredAt ? item.measuredAt.slice(11, 16) : '');
  return `${date}-${hour}`;
}

function isForecastWeatherItem(item: WeatherHourlyItem) {
  if (item.phase === 'forecast') return true;
  return typeof item.source === 'string' && item.source.includes('forecast');
}

function mergeWeatherHourlyItems(items: WeatherHourlyItem[]) {
  const byTime = new Map<string, WeatherHourlyItem>();
  items.forEach((item) => {
    const key = weatherItemKey(item);
    if (!key || key === '-') return;

    const existing = byTime.get(key);
    if (!existing) {
      byTime.set(key, item);
      return;
    }

    if (isForecastWeatherItem(existing) && !isForecastWeatherItem(item)) {
      byTime.set(key, item);
    }
  });

  return [...byTime.values()].sort((a, b) => weatherItemKey(a).localeCompare(weatherItemKey(b)));
}

function weatherItemTimestamp(item: WeatherHourlyItem) {
  const rawDate = item.date ?? item.measuredAt?.slice(0, 10) ?? '';
  const dateMatch = rawDate.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  const rawTime = item.hour ?? item.measuredAt?.slice(11, 16) ?? '';
  const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return undefined;
  const timestamp = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  ).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function currentHourRange(now = new Date()) {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  return { start: start.getTime(), end: start.getTime() + 60 * 60 * 1000 };
}

function itemsFromCurrentHour(items: WeatherHourlyItem[], now = new Date()) {
  const { start } = currentHourRange(now);
  return items.filter((item) => {
    const timestamp = weatherItemTimestamp(item);
    return timestamp === undefined || timestamp >= start;
  });
}

function itemInCurrentHour(item: WeatherHourlyItem | null, now = new Date()) {
  if (!item) return null;
  const timestamp = weatherItemTimestamp(item);
  const { start, end } = currentHourRange(now);
  return timestamp !== undefined && timestamp >= start && timestamp < end ? item : null;
}

function currentDustHourItem(currentItem: CurrentDustItem | null, todayDateLabel: string): HourlyDustItem | null {
  if (currentItem?.pm10Value == null) return null;
  const dataTime = typeof currentItem.dataTime === 'string' ? currentItem.dataTime : '';
  return {
    measuredAt: dataTime,
    date: dataTime.slice(0, 10) || todayDateLabel,
    hour: dataTime.slice(11, 16) || '현재',
    pm10Value: currentItem.pm10Value,
    pm25Value: currentItem.pm25Value,
    o3Value: currentItem.o3Value,
    no2Value: currentItem.no2Value,
    phase: 'stored',
  };
}

export function findStationForWeather(stations: StationDustItem[], region: RegionState) {
  return stations.find((station) => (
    station.sido === region.city
    && (station.city === region.region || station.name === region.region || station.name === region.label)
  )) ?? stations.find((station) => (
    station.sido === region.city
    && [station.city, station.name, station.addr].filter(Boolean).some((value) => String(value).includes(region.region))
  ));
}

export function buildDashboardHourlyItems(
  hourlyData: HourlyDustResponse,
  currentItem: CurrentDustItem | null,
  todayDateLabel: string,
) {
  const storedItems = Array.isArray(hourlyData?.items) ? hourlyData.items as HourlyDustItem[] : [];
  const forecastItems = Array.isArray(hourlyData?.forecastItems) ? hourlyData.forecastItems as HourlyDustItem[] : [];
  const latestStoredItem = storedItems.length > 0 ? { ...storedItems[storedItems.length - 1], phase: 'stored' as const } : null;
  const currentHourlyItem = currentDustHourItem(currentItem, todayDateLabel);
  const preferredStoredItem = currentHourlyItem && (
    !latestStoredItem
    || String(currentHourlyItem.measuredAt || '') >= String(latestStoredItem.measuredAt || '')
  ) ? currentHourlyItem : latestStoredItem;
  const nextItems = preferredStoredItem ? [preferredStoredItem, ...forecastItems] : forecastItems;
  if (nextItems.length > 0) return nextItems;

  if (currentItem?.pm10Value == null) return [];

  const dataTime = typeof currentItem.dataTime === 'string' ? currentItem.dataTime : '';
  return [{
    measuredAt: dataTime,
    date: dataTime.slice(0, 10) || todayDateLabel,
    hour: dataTime.slice(11, 16) || '현재',
    pm10Value: currentItem.pm10Value,
    pm25Value: currentItem.pm25Value,
    o3Value: currentItem.o3Value,
    no2Value: currentItem.no2Value,
    phase: 'stored',
  }];
}

export function buildDashboardWeatherHourlyItems(
  weatherHourlyData: HourlyWeatherResponse,
  currentWeather: WeatherState | null,
  todayDateLabel: string,
) {
  const storedItems = Array.isArray(weatherHourlyData?.items) ? weatherHourlyData.items as WeatherHourlyItem[] : [];
  const forecastItems = Array.isArray(weatherHourlyData?.forecastItems) ? weatherHourlyData.forecastItems as WeatherHourlyItem[] : [];
  const now = new Date();
  const currentItem = itemInCurrentHour(currentHourItem(currentWeather, todayDateLabel), now);
  const nextForecastItems = itemsFromCurrentHour(forecastItems, now);
  if (currentItem) {
    return mergeWeatherHourlyItems([currentItem, ...nextForecastItems]);
  }

  const latestStoredItem = storedItems.length > 0
    ? itemInCurrentHour({ ...storedItems[storedItems.length - 1], phase: 'stored' }, now)
    : null;
  const nextItems = mergeWeatherHourlyItems([
    ...(latestStoredItem ? [latestStoredItem] : []),
    ...nextForecastItems,
  ]);
  if (nextItems.length > 0) return nextItems;

  return [];
}
