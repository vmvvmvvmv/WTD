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

function forecastAfterCurrentHour(forecastItems: WeatherHourlyItem[], currentItem: WeatherHourlyItem | null) {
  if (!currentItem) return forecastItems;
  const currentKey = weatherItemKey(currentItem);
  return forecastItems.filter((item) => weatherItemKey(item) > currentKey);
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
  const latestStoredItem = storedItems.length > 0 ? { ...storedItems[storedItems.length - 1], phase: 'stored' } : null;
  const nextItems = latestStoredItem ? [latestStoredItem, ...forecastItems] : forecastItems;
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
  const currentItem = currentHourItem(currentWeather, todayDateLabel);
  const nextForecastItems = forecastAfterCurrentHour(forecastItems, currentItem);
  if (currentItem) {
    return mergeWeatherHourlyItems([currentItem, ...nextForecastItems]);
  }

  const latestStoredItem = storedItems.length > 0 ? { ...storedItems[storedItems.length - 1], phase: 'stored' } : null;
  const nextItems = mergeWeatherHourlyItems([
    ...(latestStoredItem ? [latestStoredItem] : []),
    ...nextForecastItems,
  ]);
  if (nextItems.length > 0) return nextItems;

  return [];
}
