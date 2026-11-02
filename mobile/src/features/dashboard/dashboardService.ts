import { getHourlyDust, getKoreaStations, getOptionalCurrentDust, getPastDust, getPrediction } from '../../api/dustEndpoints';
import type { CurrentDustItem, PastDustItem, StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import { normalizePredictionResponse } from './predictionResponse';
import { addDays, toCompactDate } from '../../utils/date';
import { normalizeLatLng } from '../../utils/geo';
import { loadStoredWeather } from '../weather/weatherData';
import { loadStationCache, saveStationCache } from '../stations/stationCache';
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
  // 날씨는 지역 측정소의 좌표만 있으면 됩니다. 처음 켤 때 전국 측정소 목록(크고 느림)을 받느라 배너·예보가
  // 몇 초 늦어지지 않게, 저장해 둔 목록(위치는 거의 안 바뀌니 30일까지)을 먼저 씁니다. 없을 때만 서버에서 받습니다.
  if (stations.length === 0) stations = (await loadStationCache(30 * 24 * 60 * 60 * 1000)) ?? [];
  let fetchedStations: StationDustItem[] = [];
  if (stations.length === 0) {
    const response = await getKoreaStations();
    stations = Array.isArray(response.items) ? response.items as StationDustItem[] : [];
    void saveStationCache(stations);
    fetchedStations = stations;
  }
  const station = findStationForWeather(stations, region);
  const coordinates = normalizeLatLng(station?.lat, station?.lng);
  if (!coordinates) throw new Error('선택 지역의 날씨 측정소를 찾지 못했습니다.');
  const weather = await loadStoredWeather(coordinates.lat, coordinates.lng, todayDateLabel);
  // 저장해 둔 오래된 목록은 좌표용으로만 쓰고 넘기지 않습니다(지도 등에서 옛 측정값이 보이지 않게).
  return { ...weather, stations: knownStations.length ? knownStations : fetchedStations };
}
