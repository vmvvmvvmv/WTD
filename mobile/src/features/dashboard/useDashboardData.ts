import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiHttpError, getCurrentDust } from '../../api/dustEndpoints';
import type { CurrentDustItem, HourlyDustItem, PastDustItem, PredictionResponse, StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';
import { isSameRegion } from '../region/regionUtils';
import { loadDashboardCache, saveDashboardCache } from './dashboardCache';
import { hasCompleteDashboardCache } from './dashboardCachePolicy';
import { fetchDashboardDust, fetchDashboardWeather } from './dashboardService';

const AUTO_REFRESH_MS = 10 * 60 * 1000;

// 홈·캘린더가 함께 쓰는 선택 지역의 미세먼지·날씨·예측 데이터를 불러오고 캐시합니다.
export function useDashboardData({
  autoRefresh,
  onSettled,
  selectedRegion,
  setStationItems,
  stationItems,
  todayDateLabel,
}: {
  // 홈을 보고 있는 동안만 10분마다, 그리고 앱으로 돌아올 때 다시 받습니다(서버는 예보를 매시 새로 모음).
  autoRefresh: boolean;
  // 첫 화면을 그릴 수 있게 되면(캐시든 서버 응답이든) 부릅니다. 지역 전환 로딩을 닫는 데 씁니다.
  onSettled: () => void;
  selectedRegion: RegionState | null;
  setStationItems: (stations: StationDustItem[]) => void;
  stationItems: StationDustItem[];
  todayDateLabel: string;
}) {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [pastItems, setPastItems] = useState<PastDustItem[]>([]);
  const [hourlyItems, setHourlyItems] = useState<HourlyDustItem[]>([]);
  const [weatherHourlyItems, setWeatherHourlyItems] = useState<WeatherHourlyItem[]>([]);
  const [weatherMidTermItems, setWeatherMidTermItems] = useState<WeatherMidTermItem[]>([]);
  const [currentItem, setCurrentItem] = useState<CurrentDustItem | null>(null);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [yesterdayWeather, setYesterdayWeather] = useState<WeatherState | null>(null);
  const [isRefreshingCurrent, setIsRefreshingCurrent] = useState(false);
  const [error, setError] = useState('');

  // 비동기 응답이 도착했을 때 지금 선택된 지역과 같은지 비교하기 위한 최신 값입니다.
  const selectedRegionRef = useRef(selectedRegion);
  selectedRegionRef.current = selectedRegion;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  // 지역을 바꿀 때 이전 지역 값이 잠깐이라도 보이지 않도록 비웁니다.
  const clear = () => {
    setCurrentItem(null);
    setPrediction(null);
    setPastItems([]);
    setHourlyItems([]);
    setWeather(null);
    setYesterdayWeather(null);
    setWeatherHourlyItems([]);
    setWeatherMidTermItems([]);
  };

  // 당겨서 새로고침: 현재 미세먼지 값만 다시 받습니다.
  const loadCurrentDust = async () => {
    if (!selectedRegion) return;
    setIsRefreshingCurrent(true);
    setError('');
    try {
      const currentData = await getCurrentDust(selectedRegion);
      setCurrentItem((currentData.item as CurrentDustItem | undefined) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '현재 데이터를 불러오지 못했습니다.');
    } finally {
      setIsRefreshingCurrent(false);
    }
  };

  // 현재값, 과거 흐름, 예측, 날씨를 한 번에 불러옵니다. 캐시가 있으면 먼저 보여 주고 뒤에서 갱신합니다.
  const loadDashboard = async (force = false) => {
    if (!selectedRegion) return;
    const region = selectedRegion;
    // 응답을 기다리는 사이 지역이 바뀌었다면 이전 지역 데이터로 화면을 덮어쓰지 않습니다.
    const isStale = () => !selectedRegionRef.current || !isSameRegion(selectedRegionRef.current, region);
    const cachedDashboard = await loadDashboardCache(region);
    if (isStale()) return;
    if (cachedDashboard) {
      setPrediction(cachedDashboard.prediction);
      setPastItems(cachedDashboard.pastItems);
      setHourlyItems(cachedDashboard.hourlyItems);
      setWeatherHourlyItems(cachedDashboard.weatherHourlyItems ?? []);
      setWeatherMidTermItems(cachedDashboard.weatherMidTermItems ?? []);
      setCurrentItem(cachedDashboard.currentItem);
      setWeather(cachedDashboard.weather ?? null);
      setYesterdayWeather(cachedDashboard.yesterdayWeather ?? null);
      onSettledRef.current();
      if (!force && hasCompleteDashboardCache(cachedDashboard)) return;
    }
    setError('');
    const weatherPromise = fetchDashboardWeather(region, todayDateLabel, stationItems).then(
      (value) => ({ ok: true as const, value }),
      (caught: unknown) => ({ error: caught, ok: false as const }),
    );
    // 날씨는 미세먼지 요청의 성공·실패와 상관없이 화면에 반영합니다. 실패하거나 지역이 바뀌었으면 null.
    const applyWeather = async () => {
      const weatherResult = await weatherPromise;
      if (!weatherResult.ok) {
        console.warn('대시보드 날씨 데이터를 불러오지 못했습니다.', weatherResult.error);
        return null;
      }
      if (isStale()) return null;
      const storedWeather = weatherResult.value;
      if (storedWeather.stations.length > 0 && stationItems.length === 0) setStationItems(storedWeather.stations);
      setWeatherHourlyItems(storedWeather.hourlyItems);
      setWeatherMidTermItems(storedWeather.midTermItems);
      setWeather(storedWeather.weather);
      setYesterdayWeather(storedWeather.yesterdayWeather);
      return storedWeather;
    };
    try {
      const dust = await fetchDashboardDust(region, todayDateLabel, cachedDashboard);
      if (isStale()) return;
      setPrediction(dust.prediction);
      setPastItems(dust.pastItems);
      setHourlyItems(dust.hourlyItems);
      setCurrentItem(dust.currentItem);
      onSettledRef.current();

      const dustCache = {
        currentItem: dust.currentItem,
        currentNotice: dust.currentNotice,
        hourlyItems: dust.hourlyItems,
        pastItems: dust.pastItems,
        prediction: dust.prediction,
      };
      const storedWeather = await applyWeather();
      if (storedWeather) {
        void saveDashboardCache(region, {
          ...dustCache,
          weather: storedWeather.weather,
          weatherHourlyItems: storedWeather.hourlyItems,
          weatherMidTermItems: storedWeather.midTermItems,
          yesterdayWeather: storedWeather.yesterdayWeather,
        });
      } else {
        // 날씨는 첫 화면에 꼭 필요하지 않으므로 미세먼지만 새 값으로 저장하고 날씨는 이전 캐시를 둡니다.
        void saveDashboardCache(region, {
          ...dustCache,
          weather: cachedDashboard?.weather ?? null,
          weatherHourlyItems: cachedDashboard?.weatherHourlyItems ?? [],
          weatherMidTermItems: cachedDashboard?.weatherMidTermItems ?? [],
          yesterdayWeather: cachedDashboard?.yesterdayWeather ?? null,
        });
      }
    } catch (caught) {
      // 미세먼지가 실패해도 날씨가 왔으면 보여 줍니다.
      void applyWeather();
      if (!cachedDashboard && !isStale()) {
        // 응답이 왔지만 실패한 경우와 서버에 닿지 못한 경우를 구분해 안내합니다.
        setError(caught instanceof ApiHttpError ? '데이터를 불러오지 못했어요.' : '서버에 연결할 수 없어요.');
      }
    } finally {
      // 이전 지역 요청이 새 지역의 로딩 표시를 먼저 끄지 않도록 합니다.
      if (!isStale()) onSettledRef.current();
    }
  };

  const loadDashboardRef = useRef(loadDashboard);
  loadDashboardRef.current = loadDashboard;
  useEffect(() => {
    if (!autoRefresh) return;
    const refresh = () => {
      void loadDashboardRef.current(true);
    };
    const timer = setInterval(refresh, AUTO_REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [autoRefresh]);

  return {
    clear,
    currentItem,
    error,
    hourlyItems,
    isRefreshingCurrent,
    loadCurrentDust,
    loadDashboard,
    pastItems,
    prediction,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
    yesterdayWeather,
  };
}
