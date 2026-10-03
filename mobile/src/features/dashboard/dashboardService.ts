import { getHourlyDust, getKoreaStations, getOptionalCurrentDust, getPastDust, getPrediction } from '../../api/dustEndpoints';
import type { CurrentDustItem, PastDustItem, RegionState, StationDustItem } from '../../types/dust';
import { addDays, normalizeLatLng, normalizePredictionResponse, toCompactDate } from '../../utils/dust';
import { loadStoredWeather } from '../weather/weatherData';
import { buildDashboardHourlyItems, findStationForWeather } from './dashboardData';
import type { DashboardCacheSnapshot } from './dashboardCache';

export async function fetchDashboardDust(region: RegionState, todayDateLabel: string, cached: DashboardCacheSnapshot | null) {
  const today = new Date();
  const [predictionResult, pastResult, currentResult, hourlyResult] = await Promise.allSettled([
    getPrediction(region),
    getPastDust({ region, startDate: toCompactDate(addDays(today, -7)), endDate: toCompactDate(today) }),
    getOptionalCurrentDust(region),
    getHourlyDust({ region, date: toCompactDate(today) }),
  ]);
  const results = [predictionResult, pastResult, currentResult, hourlyResult];
  if (results.every((result) => result.status === 'rejected')) {
    throw (predictionResult as PromiseRejectedResult).reason;
  }
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  failures.forEach((failure) => console.warn('대시보드 데이터 일부를 불러오지 못했습니다.', failure.reason));

  const predictionRaw = predictionResult.status === 'fulfilled' ? predictionResult.value : null;
  const pastData = pastResult.status === 'fulfilled' ? pastResult.value : null;
  const currentData = currentResult.status === 'fulfilled' ? currentResult.value : null;
  const hourlyData = hourlyResult.status === 'fulfilled' ? hourlyResult.value : null;
  const currentItem = (currentData?.item as CurrentDustItem | undefined) ?? cached?.currentItem ?? null;
  return {
    currentItem,
    currentNotice: currentData?.notice ?? cached?.currentNotice ?? '',
    hourlyItems: hourlyData
      ? buildDashboardHourlyItems(hourlyData, currentItem, todayDateLabel)
      : cached?.hourlyItems ?? buildDashboardHourlyItems(null, currentItem, todayDateLabel),
    pastItems: (pastData?.items as PastDustItem[] | undefined) ?? cached?.pastItems ?? [],
    prediction: predictionRaw
      ? normalizePredictionResponse(predictionRaw, region.city, region.region)
      : cached?.prediction ?? {},
  };
}

export async function fetchDashboardWeather(region: RegionState, todayDateLabel: string, knownStations: StationDustItem[]) {
  let stations = knownStations;
  if (stations.length === 0) {
    const response = await getKoreaStations();
    stations = Array.isArray(response.items) ? response.items as StationDustItem[] : [];
  }
  const station = findStationForWeather(stations, region);
  const coordinates = normalizeLatLng(station?.lat, station?.lng);
  if (!coordinates) throw new Error('선택 지역의 날씨 측정소를 찾지 못했습니다.');
  const weather = await loadStoredWeather(coordinates.lat, coordinates.lng, todayDateLabel);
  return { ...weather, stations };
}
