import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { WebView as WebViewType } from 'react-native-webview';
import { CalendarPanel } from './src/components/calendar/CalendarPanel';
import { buildCalendarRiskByEvent, type CalendarLocationForecast } from './src/components/calendar/calendarForecast';
import { calendarEventLocationKey } from './src/components/calendar/calendarLocation';
import { buildOutingAccentTheme } from './src/theme/appTheme';
import { DataPanel } from './src/components/data/DataPanel';
import { WeatherDataPanel } from './src/components/data/WeatherDataPanel';
import type { WeatherDataMetricKey } from './src/components/data/WeatherDataPanel';
import { HomePanel } from './src/components/home/HomePanel';
import { FullMapScreen } from './src/components/map/FullMapScreen';
import { RegionPanel } from './src/components/settings/RegionPanel';
import { styles } from './src/styles/appStyles';
import {
  getCurrentDust,
  getHourlyDust,
  getHourlyWeather,
  getKoreaStations,
  getMidTermWeather,
  getOptionalCurrentDust,
  getOptionalKoreaStations,
  getPastDust,
  getPastWeather,
  getPrediction,
  postBriefingMessage,
  registerNotificationDevice,
} from './src/api/dustEndpoints';
import {
  DATA_LIST_PAGE_SIZE,
  DEFAULT_CITY,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_REGION,
  DEFAULT_REGION_STATE,
  dataMetrics,
  dataRanges,
  tabs,
} from './src/constants/dust';
import { API_URL, APP_TEST_TOKEN, IS_EXPO_GO } from './src/config/runtime';
import {
  buildDashboardHourlyItems,
  buildDashboardWeatherHourlyItems,
  findStationForWeather,
} from './src/features/dashboard/dashboardData';
import { loadDashboardCache, saveDashboardCache } from './src/features/dashboard/dashboardCache';
import { loadStationCache, saveStationCache } from './src/features/stations/stationCache';
import {
  loadCalendarNotificationIds,
  loadStoredAppState,
  saveCalendarEvents,
  saveCalendarNotificationIds,
  saveFavoriteRegions,
  saveGpsRegion,
  saveMapRecentSearches,
  saveNotificationSettings,
  saveNotificationToken,
  saveSelectedRegion,
} from './src/storage/appStorage';
import { cancelCalendarEventNotifications, configureDustNotifications, requestDustPushToken, scheduleCalendarEventNotifications } from './src/notifications/expoPush';
import type {
  BriefingMessage,
  CalendarEvent,
  CurrentDustItem,
  DataMetricKey,
  HourlyDustItem,
  NotificationSettings,
  PastDustItem,
  PredictionResponse,
  RegionState,
  StationDustItem,
  TabKey,
  WeatherDailyItem,
  WeatherState,
  WeatherHourlyItem,
  WeatherMidTermItem,
} from './src/types/dust';
import {
  addDays,
  csvSafe,
  formatCurrentBasis,
  formatMapValue,
  formatValue,
  getMetricLabel,
  getMetricTone,
  getMetricValue,
  getNo2Tone,
  getO3Tone,
  getPm10Label,
  getPm10Progress,
  getPm25Label,
  getPm25Tone,
  getO3Label,
  haversineKm,
  isSameRegion,
  normalizeLatLng,
  normalizePredictionResponse,
  normalizeSearchText,
  stationIdentity,
  toCompactDate,
  toIsoDate,
  toNumber,
  uniqueStations,
  wait,
} from './src/utils/dust';
import { getWeatherIcon } from './src/utils/weather';

// 앱 전체의 탭 상태, API 데이터, 위치/즐겨찾기/알림 설정을 관리하는 최상위 컨테이너입니다.
function AppContent() {
  // 탭과 홈/상세/지도/챗봇에서 공유하는 API 데이터 상태입니다.
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [pastItems, setPastItems] = useState<PastDustItem[]>([]);
  const [hourlyItems, setHourlyItems] = useState<HourlyDustItem[]>([]);
  const [weatherHourlyItems, setWeatherHourlyItems] = useState<WeatherHourlyItem[]>([]);
  const [weatherMidTermItems, setWeatherMidTermItems] = useState<WeatherMidTermItem[]>([]);
  const [detailWeatherItems, setDetailWeatherItems] = useState<WeatherDailyItem[]>([]);
  const [dataItems, setDataItems] = useState<PastDustItem[]>([]);
  const [currentItem, setCurrentItem] = useState<CurrentDustItem | null>(null);
  const [currentNotice, setCurrentNotice] = useState('');
  const [stationItems, setStationItems] = useState<StationDustItem[]>([]);
  const [mapSearchText, setMapSearchText] = useState('');
  const [mapSearchMessage, setMapSearchMessage] = useState('');
  const [isMapSearchFocused, setIsMapSearchFocused] = useState(false);
  const [mapMarkerMode, setMapMarkerMode] = useState<'dust' | 'weather'>('dust');
  const [mapRecentSearches, setMapRecentSearches] = useState<StationDustItem[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedStation, setSelectedStation] = useState<StationDustItem | null>(null);
  const [mapViewKey, setMapViewKey] = useState(0);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [detailWeather, setDetailWeather] = useState<WeatherState | null>(null);
  const [selectedStationWeather, setSelectedStationWeather] = useState<WeatherState | null>(null);

  // 상세 데이터 탭의 기간, 오염물질, 차트 선택 상태입니다.
  const [dataMetric, setDataMetric] = useState<DataMetricKey>('pm10');
  const [dataDetailMode, setDataDetailMode] = useState<'dust' | 'weather'>('dust');
  const [weatherDataMetric, setWeatherDataMetric] = useState<WeatherDataMetricKey>('temperature');
  const [dataRangeDays, setDataRangeDays] = useState(30);
  const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null);

  // 챗봇 대화 입력과 메시지 상태입니다.
  const [briefingInput, setBriefingInput] = useState('');
  const [briefingMessages, setBriefingMessages] = useState<BriefingMessage[]>([]);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLocationForecasts, setCalendarLocationForecasts] = useState<Record<string, CalendarLocationForecast>>({});

  // GPS 기준 지역, 사용자가 선택한 지역, 즐겨찾기 지역 상태입니다.
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionState | null>(null);
  const [gpsRegion, setGpsRegion] = useState<RegionState | null>(null);
  const [detailRegion, setDetailRegion] = useState<RegionState | null>(null);
  const [favoriteRegions, setFavoriteRegions] = useState<RegionState[]>([]);
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [showHomeRegionSearch, setShowHomeRegionSearch] = useState(false);
  const [homeRegionSearchText, setHomeRegionSearchText] = useState('');
  const [showDataRegionPicker, setShowDataRegionPicker] = useState(false);
  const [dataRegionSearchText, setDataRegionSearchText] = useState('');

  // 알림 권한과 일정 알림 설정 저장 상태입니다.
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [serverPushToken, setServerPushToken] = useState<string | null>(null);
  const [isSavingNotificationSettings, setIsSavingNotificationSettings] = useState(false);
  const [isRegionTransitioning, setIsRegionTransitioning] = useState(false);
  const [hasLoadedRegionStore, setHasLoadedRegionStore] = useState(false);
  const [hasTriedInitialLocation, setHasTriedInitialLocation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingCurrent, setIsRefreshingCurrent] = useState(false);
  const [isLoadingStations, setIsLoadingStations] = useState(false);
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [error, setError] = useState('');

  // 현재 선택 지역과 불러온 데이터에서 UI 색상과 표시값을 계산합니다.
  const latestPastItem = pastItems[pastItems.length - 1];
  const activeCity = selectedRegion?.city ?? '';
  const activeRegion = selectedRegion?.region ?? '';
  const activeDataRegion = detailRegion ?? selectedRegion;
  const currentPm10 = toNumber(currentItem?.pm10Value) ?? toNumber(latestPastItem?.pm10Value);
  const currentPm25 = toNumber(currentItem?.pm25Value) ?? toNumber(latestPastItem?.pm25Value);
  const currentO3 = toNumber(currentItem?.o3Value) ?? toNumber(latestPastItem?.o3Value);
  const accentTheme = buildOutingAccentTheme({ pm10: currentPm10, weather });
  const accentTone = accentTheme.tone;
  const accentSoftTone = accentTheme.softTone;
  const accentBorderTone = accentTheme.borderTone;
  const todayDateLabel = toIsoDate(new Date());
  const baseUrl = API_URL.replace(/\/$/, '');
  const mapBaseUrl = baseUrl.replace(/^http:\/\/localhost(?=[:/]|$)/, 'http://127.0.0.1');
  const mobileMapUrl = `${mapBaseUrl}/dust/mobile-map/`;
  const buildMobileMapUrl = (params?: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    if (APP_TEST_TOKEN) query.set('app_test_token', APP_TEST_TOKEN);
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
    const suffix = query.toString();
    return `${mobileMapUrl}${suffix ? `?${suffix}` : ''}`;
  };

  // WebView 지도 제어, 스크롤 제어, 탭 이동 감지를 위한 ref입니다.
  const mapWebViewRef = useRef<WebViewType>(null);
  const mapSearchInputRef = useRef<TextInput | null>(null);
  const mapSearchOverlayInputRef = useRef<TextInput | null>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const previousTabRef = useRef<TabKey>(activeTab);

  // 지역 전환, 검색 패널, 토스트 표시 애니메이션 값입니다.
  const regionTransitionOpacity = useRef(new Animated.Value(0)).current;
  const regionTransitionScale = useRef(new Animated.Value(0.98)).current;
  const homePanelOpacity = useRef(new Animated.Value(0)).current;
  const homePanelTranslateY = useRef(new Animated.Value(-8)).current;
  const dataRegionPickerOpacity = useRef(new Animated.Value(0)).current;
  const dataRegionPickerTranslateY = useRef(new Animated.Value(-8)).current;
  const mapSearchOverlayOpacity = useRef(new Animated.Value(0)).current;
  const mapSearchOverlayTranslateY = useRef(new Animated.Value(18)).current;
  const notificationToastOpacity = useRef(new Animated.Value(0)).current;
  const notificationToastTranslateY = useRef(new Animated.Value(16)).current;
  const calendarNotificationSyncRef = useRef(0);

  // Android에서는 검색 화면이 닫히는 순간 키보드가 다시 붙는 경우가 있어 여러 타이밍에 한 번 더 내립니다.
  const dismissMapSearchKeyboard = () => {
    mapSearchInputRef.current?.blur();
    mapSearchOverlayInputRef.current?.blur();
    Keyboard.dismiss();
    setTimeout(() => {
      mapSearchInputRef.current?.blur();
      mapSearchOverlayInputRef.current?.blur();
      Keyboard.dismiss();
    }, 80);
    setTimeout(() => {
      Keyboard.dismiss();
    }, 220);
  };

  // 앱 실행 시 알림 핸들러와 Android 알림 채널을 미리 설정합니다.
  useEffect(() => {
    let cancelled = false;
    const configureNotifications = async () => {
      await configureDustNotifications();
      if (cancelled) return;
    };
    configureNotifications().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const mapStations = useMemo(
    () => stationItems.filter((station) => normalizeLatLng(station.lat, station.lng)),
    [stationItems],
  );

  const weatherStateFromHourlyItem = (item?: WeatherHourlyItem): WeatherState | null => {
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
  };

  const weatherStateFromStation = (station?: StationDustItem | null): WeatherState | null => {
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
  };

  const switchMapMarkerMode = (mode: 'dust' | 'weather') => {
    dismissMapSearchKeyboard();
    setIsMapSearchFocused(false);
    setShowSearchSuggestions(false);
    setMapSearchMessage('');
    setMapMarkerMode(mode);
    mapWebViewRef.current?.injectJavaScript(`
      if (window.setMapMode) window.setMapMode(${JSON.stringify(mode)});
      true;
    `);
  };

  const loadStoredWeather = async (lat: number, lng: number) => {
    const todayCompact = toCompactDate(new Date());
    const midTermEndCompact = toCompactDate(addDays(new Date(), 14));
    const weatherHourlyData = await getHourlyWeather({ date: todayCompact, forecastHours: 72, lat, lng });
    const midTermData = await getMidTermWeather({ endDate: midTermEndCompact, lat, lng, startDate: todayCompact });
    const storedItems = Array.isArray(weatherHourlyData?.items) ? weatherHourlyData.items as WeatherHourlyItem[] : [];
    const currentWeather = weatherStateFromHourlyItem(storedItems[storedItems.length - 1]);
    return {
      hourlyItems: buildDashboardWeatherHourlyItems(weatherHourlyData, currentWeather, todayDateLabel),
      midTermItems: Array.isArray(midTermData?.items) ? midTermData.items as WeatherMidTermItem[] : [],
      weather: currentWeather,
    };
  };

  const loadWeather = async (lat: number, lng: number) => {
    try {
      const storedWeather = await loadStoredWeather(lat, lng);
      setWeather(storedWeather.weather);
    } catch {
      setWeather(null);
    }
  };

  const loadCalendarLocationForecast = async (event: CalendarEvent): Promise<[string, CalendarLocationForecast] | null> => {
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
  };

  // 지도 검색어에 맞는 측정소 후보를 계산합니다.
  const searchSuggestions = useMemo(() => {
    const keyword = normalizeSearchText(mapSearchText.trim());
    if (!keyword) return [];
    return uniqueStations(
      mapStations.filter((station) => {
        const target = normalizeSearchText([station.sido, station.city, station.name, station.addr].filter(Boolean).join(' '));
        return target.includes(keyword);
      }),
    )
      .slice(0, 5);
  }, [mapSearchText, mapStations]);

  // 홈 화면 지역 검색어에 맞는 측정소 후보를 계산합니다.
  const homeRegionSuggestions = useMemo(() => {
    const keyword = normalizeSearchText(homeRegionSearchText.trim());
    if (!keyword) return [];
    return uniqueStations(
      mapStations.filter((station) => {
        const target = normalizeSearchText([station.sido, station.city, station.name, station.addr].filter(Boolean).join(' '));
        return target.includes(keyword);
      }),
    )
      .slice(0, 6);
  }, [homeRegionSearchText, mapStations]);

  // 상세 데이터 지역 검색어에 맞는 측정소 후보를 계산합니다.
  const dataRegionSuggestions = useMemo(() => {
    const keyword = normalizeSearchText(dataRegionSearchText.trim());
    if (!keyword) return [];
    return uniqueStations(
      mapStations.filter((station) => {
        const target = normalizeSearchText([station.sido, station.city, station.name, station.addr].filter(Boolean).join(' '));
        return target.includes(keyword);
      }),
    )
      .slice(0, 6);
  }, [dataRegionSearchText, mapStations]);

  // 현재 선택 지역의 최신 미세먼지 값을 다시 불러옵니다.
  const loadCurrentDust = async () => {
    if (!selectedRegion) return;
    setIsRefreshingCurrent(true);
    setError('');
    try {
      const currentData = await getCurrentDust(selectedRegion);
      setCurrentItem((currentData.item as CurrentDustItem | undefined) ?? null);
      setCurrentNotice(currentData.notice ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '현재 데이터를 불러오지 못했습니다.');
    } finally {
      setIsRefreshingCurrent(false);
    }
  };

  // 전국 측정소 목록과 실시간 값을 불러와 지도/검색에서 사용합니다.
  const loadStations = async () => {
    setIsLoadingStations(true);
    try {
      const cachedStations = await loadStationCache();
      if (cachedStations?.length) {
        setStationItems(cachedStations);
      }
      const stationData = await getKoreaStations();
      const nextStations = (stationData.items as StationDustItem[] | undefined) ?? [];
      setStationItems(nextStations);
      saveStationCache(nextStations);
    } finally {
      setIsLoadingStations(false);
    }
  };

  // 상세 데이터 탭에서 선택한 기간의 일평균 데이터를 불러옵니다.
  const loadPastData = async (days = dataRangeDays) => {
    if (!activeDataRegion) return;
    setIsLoadingPast(true);
    setError('');
    try {
      const today = new Date();
      const latestDailyDate = addDays(today, -1);
      const pastData = await getPastDust({
        region: activeDataRegion,
        startDate: toCompactDate(addDays(today, -days)),
        endDate: toCompactDate(latestDailyDate),
      });
      setDataItems((pastData.items as PastDustItem[] | undefined) ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '상세 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoadingPast(false);
    }
  };

  // 상세 데이터 탭의 날씨 화면에서 ASOS 일자료를 불러옵니다.
  const loadWeatherDetail = async () => {
    if (!activeDataRegion) return;
    setIsLoadingPast(true);
    setError('');
    try {
      const today = new Date();
      const latestDailyDate = addDays(today, -1);
      const weatherData = await getPastWeather({
        region: activeDataRegion,
        startDate: toCompactDate(addDays(today, -dataRangeDays)),
        endDate: toCompactDate(latestDailyDate),
      });
      setDetailWeatherItems((weatherData?.items as WeatherDailyItem[] | undefined) ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '기상 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoadingPast(false);
    }
  };

  // 홈/챗봇에서 쓰는 현재값, 과거 흐름, 예측 데이터를 한 번에 불러옵니다.
  const loadDashboard = async (force = false) => {
    if (!selectedRegion) return;
    const region = selectedRegion;
    const cachedDashboard = await loadDashboardCache(region);
    if (cachedDashboard) {
      setPrediction(cachedDashboard.prediction);
      setPastItems(cachedDashboard.pastItems);
      setHourlyItems(cachedDashboard.hourlyItems);
      setWeatherHourlyItems(cachedDashboard.weatherHourlyItems ?? []);
      setWeatherMidTermItems(cachedDashboard.weatherMidTermItems ?? []);
      setCurrentItem(cachedDashboard.currentItem);
      setCurrentNotice(cachedDashboard.currentNotice);
      setWeather(cachedDashboard.weather ?? null);
      setIsLoading(false);
      finishRegionTransition();
      if (!force) return;
    } else {
      setIsLoading(true);
    }
      setError('');
    try {
      const today = new Date();
      const todayCompact = toCompactDate(today);
      const [predictionRawData, pastData, currentData, hourlyData] = await Promise.all([
        getPrediction(region),
        getPastDust({
          region,
          startDate: toCompactDate(addDays(today, -7)),
          endDate: todayCompact,
        }),
        getOptionalCurrentDust(region),
        getHourlyDust({ region, date: todayCompact }),
      ]);

      const predictionData = normalizePredictionResponse(predictionRawData, region.city, region.region);
      const nextPastItems = (pastData.items as PastDustItem[] | undefined) ?? [];
      const currentDustItem = (currentData?.item as CurrentDustItem | undefined) ?? null;
      const nextHourlyItems = buildDashboardHourlyItems(hourlyData, currentDustItem, todayDateLabel);

      setPrediction(predictionData);
      setPastItems(nextPastItems);
      setHourlyItems(nextHourlyItems);
      setCurrentItem(currentDustItem);
      setCurrentNotice(currentData?.notice ?? '');
      setIsLoading(false);
      finishRegionTransition();
      void saveDashboardCache(region, {
        currentItem: currentDustItem,
        currentNotice: currentData?.notice ?? '',
        hourlyItems: nextHourlyItems,
        pastItems: nextPastItems,
        prediction: predictionData,
        weather: null,
        weatherHourlyItems: [],
        weatherMidTermItems: [],
      });

      try {
        let nextStationItems = stationItems;
        if (nextStationItems.length === 0) {
          const stationData = await getOptionalKoreaStations();
          nextStationItems = Array.isArray(stationData?.items) ? stationData.items as StationDustItem[] : [];
          if (nextStationItems.length > 0) setStationItems(nextStationItems);
        }

        const weatherStation = findStationForWeather(nextStationItems, region);
        const weatherCoords = normalizeLatLng(weatherStation?.lat, weatherStation?.lng);
        let nextWeatherHourlyItems: WeatherHourlyItem[] = [];
        let nextWeatherMidTermItems: WeatherMidTermItem[] = [];
        let currentWeatherData: WeatherState | null = null;
        if (weatherCoords) {
          const storedWeather = await loadStoredWeather(weatherCoords.lat, weatherCoords.lng);
          nextWeatherHourlyItems = storedWeather.hourlyItems;
          nextWeatherMidTermItems = storedWeather.midTermItems;
          currentWeatherData = storedWeather.weather;
        }

        setWeatherHourlyItems(nextWeatherHourlyItems);
        setWeatherMidTermItems(nextWeatherMidTermItems);
        setWeather(currentWeatherData);
        void saveDashboardCache(region, {
          currentItem: currentDustItem,
          currentNotice: currentData?.notice ?? '',
          hourlyItems: nextHourlyItems,
          pastItems: nextPastItems,
          prediction: predictionData,
          weather: currentWeatherData,
          weatherHourlyItems: nextWeatherHourlyItems,
          weatherMidTermItems: nextWeatherMidTermItems,
        });
      } catch {
        // Weather is secondary for first paint; keep the dust dashboard visible.
      }
    } catch (caught) {
      if (!cachedDashboard) {
        setError(caught instanceof Error ? caught.message : 'API 연결에 실패했습니다.');
      }
    } finally {
      setIsLoading(false);
      finishRegionTransition();
    }
  };

  // 지역이 바뀔 때 홈 화면 위에 짧은 로딩 애니메이션을 띄웁니다.
  const startRegionTransition = () => {
    regionTransitionOpacity.stopAnimation();
    regionTransitionScale.stopAnimation();
    regionTransitionOpacity.setValue(0);
    regionTransitionScale.setValue(0.98);
    setIsRegionTransitioning(true);
    Animated.parallel([
      Animated.timing(regionTransitionOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(regionTransitionScale, {
        toValue: 1,
        damping: 16,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // 지역 전환 로딩 애니메이션을 자연스럽게 종료합니다.
  const finishRegionTransition = () => {
    Animated.timing(regionTransitionOpacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIsRegionTransitioning(false);
    });
  };

  // 지도 검색 결과나 최근 검색 항목을 선택했을 때 WebView 지도를 해당 측정소로 이동합니다.
  const focusMapStation = (station?: StationDustItem) => {
    const coords = normalizeLatLng(station?.lat, station?.lng);
    if (!station || !coords) {
      setMapSearchMessage('검색 결과가 없습니다.');
      return;
    }
    const normalizedStation = { ...station, lat: coords.lat, lng: coords.lng };
    setShowSearchSuggestions(false);
    setIsMapSearchFocused(false);
    dismissMapSearchKeyboard();
    setMapSearchText(station.name ?? station.city ?? mapSearchText);
    setMapSearchMessage(`${station.sido ?? ''} ${station.name ?? station.city ?? ''}`.trim());
    setSelectedStation(null);
    setMapRecentSearches((items) => {
      const nextItems = [normalizedStation, ...items.filter((item) => !(item.sido === station.sido && item.name === station.name && item.city === station.city))];
      return nextItems.slice(0, 8);
    });
    const focusPayload = JSON.stringify({
      city: station.city,
      key: stationIdentity(normalizedStation),
      lat: coords.lat,
      lng: coords.lng,
      name: station.name,
      sido: station.sido,
    });
    mapWebViewRef.current?.injectJavaScript(`
      window.__pendingFocusStation = ${focusPayload};
      if (typeof window.focusStation === 'function') {
        window.focusStation(window.__pendingFocusStation);
        setTimeout(function() { window.focusStation(${focusPayload}); }, 180);
        setTimeout(function() { window.focusStation(${focusPayload}); }, 520);
        window.__pendingFocusStation = null;
      }
      true;
    `);
  };

  // 시/도와 구/군/측정소 이름을 이용해 가장 적절한 측정소를 찾습니다.
  const findStationForRegion = (region?: RegionState | null) => {
    if (!region) return undefined;
    return mapStations.find((station) => (
      station.sido === region.city
      && (station.city === region.region || station.name === region.region || station.name === region.label)
    )) ?? mapStations.find((station) => (
      station.sido === region.city
      && [station.city, station.name, station.addr].filter(Boolean).some((value) => String(value).includes(region.region))
    ));
  };

  // 지도 검색창의 GPS 버튼을 눌렀을 때 GPS 기준 측정소로 이동하고 하단 정보창을 엽니다.
  const focusGpsMapRegion = () => {
    const station = findStationForRegion(gpsRegion);
    const coords = normalizeLatLng(station?.lat, station?.lng);
    if (!station || !coords) {
      setMapSearchMessage('GPS 기준 지역의 측정소를 찾지 못했습니다.');
      return;
    }
    Keyboard.dismiss();
    setIsMapSearchFocused(false);
    setShowSearchSuggestions(false);
    setSelectedStation({ ...station, lat: coords.lat, lng: coords.lng });
    setMapSearchText('');
    setMapSearchMessage(`${gpsRegion?.city ?? station.sido ?? ''} ${gpsRegion?.region ?? station.city ?? station.name ?? ''}`.trim());
    const focusPayload = JSON.stringify({
      city: station.city,
      key: stationIdentity({ ...station, lat: coords.lat, lng: coords.lng }),
      lat: coords.lat,
      lng: coords.lng,
      name: station.name,
      sido: station.sido,
    });
    mapWebViewRef.current?.injectJavaScript(`
      if (typeof window.focusStation === 'function') {
        window.focusStation(${focusPayload});
      } else {
        window.__pendingFocusStation = ${focusPayload};
      }
      true;
    `);
  };

  const calendarMapPickerStation = findStationForRegion(gpsRegion) ?? findStationForRegion(selectedRegion);
  const calendarMapPickerCoords = normalizeLatLng(calendarMapPickerStation?.lat, calendarMapPickerStation?.lng);
  const homeMapPreviewStation = findStationForRegion(gpsRegion) ?? findStationForRegion(selectedRegion);
  const homeMapPreviewCoords = normalizeLatLng(homeMapPreviewStation?.lat, homeMapPreviewStation?.lng);
  const homeMapPreviewUrl = homeMapPreviewCoords
    ? buildMobileMapUrl({ lat: homeMapPreviewCoords.lat, lng: homeMapPreviewCoords.lng, zoom: 11, view: 'preview' })
    : buildMobileMapUrl({ view: 'preview' });
  const fullMapUrlRef = useRef<string | null>(null);  
  if (activeTab === 'map' && !fullMapUrlRef.current) {
      fullMapUrlRef.current = homeMapPreviewCoords
        ? buildMobileMapUrl({ lat: homeMapPreviewCoords.lat, lng: homeMapPreviewCoords.lng, zoom: 11, view: 'full' })
        : buildMobileMapUrl({ view: 'full' });
    } else if (activeTab !== 'map') {
      fullMapUrlRef.current = null;
    }
    const fullMapUrl = fullMapUrlRef.current ?? buildMobileMapUrl({ view: 'full' });
  const homeMapPreviewLabel = [gpsRegion?.city || selectedRegion?.city, gpsRegion?.region || selectedRegion?.region].filter(Boolean).join(' ') || '\uD604\uC7AC \uC704\uCE58';
  const calendarMapPickerUrl = calendarMapPickerCoords
    ? buildMobileMapUrl({ lat: calendarMapPickerCoords.lat, lng: calendarMapPickerCoords.lng, zoom: 15, view: 'picker' })
    : buildMobileMapUrl({ view: 'picker' });
  const calendarDefaultLocation = calendarMapPickerStation && calendarMapPickerCoords
    ? {
      address: calendarMapPickerStation.addr,
      city: calendarMapPickerStation.sido || gpsRegion?.city || selectedRegion?.city,
      label: [calendarMapPickerStation.sido || gpsRegion?.city || selectedRegion?.city, calendarMapPickerStation.city || gpsRegion?.region || calendarMapPickerStation.name || selectedRegion?.region].filter(Boolean).join(' '),
      lat: calendarMapPickerCoords.lat,
      lng: calendarMapPickerCoords.lng,
      region: calendarMapPickerStation.city || gpsRegion?.region || calendarMapPickerStation.name,
      source: 'station',
    }
    : null;

  // 지도 하단 정보창에서 지역명을 누르거나 마커를 더블 탭했을 때 상세 데이터 탭으로 이동합니다.
  const openStationDetail = (station: StationDustItem) => {
    const city = station.sido;
    const region = station.city || station.name;
    if (!city || !region) {
      setMapSearchMessage('상세 데이터를 열 지역 정보가 없습니다.');
      return;
    }
    setSelectedStation(null);
    setShowSearchSuggestions(false);
    Keyboard.dismiss();
    setMapSearchMessage('');
    setDataMetric('pm10');
    setDataRangeDays(30);
    setSelectedChartDate(null);
    setDataItems([]);
    setDetailRegion({ city, region, label: station.name });
  };

  const openSelectedRegionDetail = () => {
    if (!selectedRegion) return;
    Keyboard.dismiss();
    setShowFavoritePicker(false);
    setShowHomeRegionSearch(false);
    setHomeRegionSearchText('');
    setDataMetric('pm10');
    setDataRangeDays(30);
    setSelectedChartDate(null);
    setDataItems([]);
    setDetailRegion(selectedRegion);
  };

  // WebView 안의 네이버 지도에서 보낸 마커 선택/상세 이동 이벤트를 처리합니다.
  const handleMapMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: string; station?: StationDustItem };
      if (payload.type === 'station-selected' && payload.station) {
        Keyboard.dismiss();
        setIsMapSearchFocused(false);
        setSelectedStation(payload.station);
        setSelectedStationWeather(weatherStateFromStation(payload.station));
        setMapSearchMessage('');
        setShowSearchSuggestions(false);
      }
      if (payload.type === 'station-detail' && payload.station) {
        Keyboard.dismiss();
        setIsMapSearchFocused(false);
        openStationDetail(payload.station);
      }
    } catch {
      // Ignore non-JSON messages from the WebView.
    }
  };

  // 지도 검색 전체 화면을 닫고 키보드도 함께 내립니다.
  const closeMapSearch = () => {
    Keyboard.dismiss();
    setIsMapSearchFocused(false);
    setShowSearchSuggestions(false);
  };

  // 지도 검색 화면의 최근 검색 항목을 하나 삭제합니다.
  const removeMapRecentSearch = (station: StationDustItem) => {
    setMapRecentSearches((items) => items.filter((item) => !(item.sido === station.sido && item.name === station.name && item.city === station.city)));
  };

  // 챗봇 대화와 입력값을 초기 상태로 되돌립니다.
  const resetBriefingMessages = () => {
    setBriefingMessages([]);
    setBriefingInput('');
  };

  // 상세 데이터 탭을 기본 화면으로 되돌립니다.
  const resetDataTab = () => {
    setDetailRegion(null);
    setShowDataRegionPicker(false);
    setDataRegionSearchText('');
    setDataMetric('pm10');
    setDataRangeDays(30);
    setSelectedChartDate(null);
    setDataItems([]);
    setError('');
  };

  const addCalendarEvent = (event: CalendarEvent) => {
    setCalendarEvents((current) => [event, ...current]
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 80));
  };

  const addCalendarEvents = (events: CalendarEvent[]) => {
    setCalendarEvents((current) => [...events, ...current]
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 420));
  };

  const removeCalendarEvent = (eventId: string) => {
    setCalendarEvents((current) => current.filter((event) => event.id !== eventId));
  };

  const updateCalendarEvent = (updatedEvent: CalendarEvent) => {
    setCalendarEvents((current) => current
      .map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
  };

  const updateCalendarEventSeries = (updatedEvent: CalendarEvent) => {
    if (!updatedEvent.repeatGroupId) {
      updateCalendarEvent(updatedEvent);
      return;
    }
    setCalendarEvents((current) => current
      .map((event) => {
        if (event.repeatGroupId !== updatedEvent.repeatGroupId) return event;
        return {
          ...event,
          activityType: updatedEvent.activityType,
          endTime: updatedEvent.endTime,
          location: updatedEvent.location,
          locationAddress: updatedEvent.locationAddress,
          locationCity: updatedEvent.locationCity,
          locationLat: updatedEvent.locationLat,
          locationLng: updatedEvent.locationLng,
          locationRegion: updatedEvent.locationRegion,
          locationSource: updatedEvent.locationSource,
          memo: updatedEvent.memo,
          notificationHoursBefore: updatedEvent.notificationHoursBefore,
          sensitive: updatedEvent.sensitive,
          time: updatedEvent.time,
          title: updatedEvent.title,
        };
      })
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
  };

  // 사용자의 챗봇 질문을 백엔드에 보내고 답변을 대화 목록에 추가합니다.
  const sendBriefingQuestion = async (question: string, quickType = '') => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isBriefingLoading) return;

    setBriefingInput('');
    setIsBriefingLoading(true);
    setBriefingMessages((messages) => [...messages.slice(-5), { role: 'user', text: trimmedQuestion }]);
    const startedAt = Date.now();
    try {
      if (!selectedRegion) throw new Error('지역을 먼저 선택해 주세요.');
      const data = await postBriefingMessage({
        question: trimmedQuestion,
        quickType,
        region: selectedRegion,
        currentData: currentItem,
        prediction,
        weather,
      });
      await wait(Math.max(0, 850 - (Date.now() - startedAt)));
      if (previousTabRef.current === 'calendar') {
        setBriefingMessages((messages) => [...messages, { role: 'bot', text: data.answer ?? '답변을 불러오지 못했습니다.' }]);
      }
    } catch (caught) {
      await wait(Math.max(0, 650 - (Date.now() - startedAt)));
      if (previousTabRef.current === 'calendar') {
        setBriefingMessages((messages) => [
          ...messages,
          { role: 'bot', text: caught instanceof Error ? caught.message : '챗봇 답변을 불러오지 못했습니다.' },
        ]);
      }
    } finally {
      setIsBriefingLoading(false);
    }
  };

  // 설정 탭의 알림 토글 변경을 저장 상태에 반영합니다.
  const updateNotificationSetting = (key: keyof NotificationSettings, value: boolean | number) => {
    if (key === 'enabled' && value && IS_EXPO_GO) {
      setNotificationMessage('Expo Go에서는 알림을 켤 수 없습니다. 앱 테스트는 그대로 가능하고, 알림은 개발 빌드에서 확인해야 합니다.');
      return;
    }
    const nextSettings = { ...notificationSettings, [key]: value } as NotificationSettings;
    setIsSavingNotificationSettings(true);
    setNotificationMessage('');
    setNotificationSettings(nextSettings);
    if (key === 'calendarReminders') {
      setNotificationMessage(value ? '일정 알림이 켜졌습니다.' : '일정 알림이 꺼졌습니다.');
    } else {
      setNotificationMessage(value ? '알림 설정이 저장되었습니다.' : '알림이 꺼졌습니다.');
    }
    setIsSavingNotificationSettings(false);
  };

  // 홈 기준 지역을 바꾸고 관련 화면 데이터를 새로 불러올 준비를 합니다.
  const applyRegion = (region: RegionState, message?: string) => {
    const isSameSelectedRegion = selectedRegion ? isSameRegion(region, selectedRegion) : false;
    if (isSameSelectedRegion) {
      setShowFavoritePicker(false);
      setShowHomeRegionSearch(false);
      setHomeRegionSearchText('');
      if (message) setLocationMessage(message);
      setActiveTab('home');
      if (!currentItem || !prediction || pastItems.length === 0) {
        startRegionTransition();
        void loadDashboard();
      } else {
        finishRegionTransition();
      }
      return;
    }

    startRegionTransition();
    setSelectedRegion(region);
    setShowFavoritePicker(false);
    setShowHomeRegionSearch(false);
    setHomeRegionSearchText('');
    setCurrentItem(null);
    setPrediction(null);
    setPastItems([]);
    setHourlyItems([]);
    setWeather(null);
    setWeatherHourlyItems([]);
    setWeatherMidTermItems([]);
    setDetailWeather(null);
    setDetailWeatherItems([]);
    setCurrentNotice('');
    setDataItems([]);
    if (message) setLocationMessage(message);
    setActiveTab('home');
  };

  // 앱을 바로 종료해도 즐겨찾기가 남도록 변경 즉시 SecureStore에 저장합니다.
  const persistFavoriteRegions = (regions: RegionState[]) => {
    saveFavoriteRegions(regions);
  };

  // 즐겨찾기 지역을 삭제하고 저장소에도 즉시 반영합니다.
  const removeFavoriteRegion = (region: RegionState) => {
    setFavoriteRegions((regions) => {
      if (!regions.some((item) => isSameRegion(item, region))) return regions;
      const nextRegions = regions.filter((item) => !isSameRegion(item, region));
      persistFavoriteRegions(nextRegions);
      setNotificationMessage(`${region.city} ${region.region} 즐겨찾기에서 삭제했어요.`);
      return nextRegions;
    });
  };

  // 지도/홈 검색에서 별표를 눌렀을 때 즐겨찾기 추가와 해제를 처리합니다.
  const toggleFavoriteRegion = (region: RegionState) => {
    setFavoriteRegions((regions) => {
      if (regions.some((item) => isSameRegion(item, region))) {
        const nextRegions = regions.filter((item) => !isSameRegion(item, region));
        persistFavoriteRegions(nextRegions);
        setNotificationMessage(`${region.city} ${region.region} 즐겨찾기에서 삭제했어요.`);
        return nextRegions;
      }
      const nextRegions = [region, ...regions].slice(0, 15);
      persistFavoriteRegions(nextRegions);
      setNotificationMessage(`${region.city} ${region.region} 즐겨찾기에 추가했어요.`);
      return nextRegions;
    });
  };

  // 홈 상단 지역명을 눌렀을 때 즐겨찾기 선택 패널을 여닫습니다.
  const toggleFavoritePicker = () => {
    if (favoriteRegions.length === 0) return;
    setShowFavoritePicker((visible) => !visible);
    setShowHomeRegionSearch(false);
  };

  // 홈에서 지역 검색 패널을 열고, 필요하면 측정소 목록을 먼저 불러옵니다.
  const openHomeRegionSearch = () => {
    setShowHomeRegionSearch((visible) => !visible);
    setShowFavoritePicker(false);
    if (stationItems.length === 0) loadStations();
  };

  // 홈 지역 검색 결과를 눌렀을 때 홈 기준 지역으로 적용합니다.
  const selectHomeRegionSuggestion = (station: StationDustItem) => {
    const city = station.sido;
    const region = station.city || station.name;
    if (!city || !region) return;
    const nextRegion = { city, region, label: station.name };
    setHomeRegionSearchText('');
    setShowHomeRegionSearch(false);
    applyRegion(nextRegion, `${city} ${region} 기준으로 변경했습니다.`);
  };

  // 홈 지역 검색 결과 오른쪽 별표로 즐겨찾기를 추가하거나 해제합니다.
  const toggleHomeSuggestionFavorite = (station: StationDustItem) => {
    const city = station.sido;
    const region = station.city || station.name;
    if (!city || !region) return;
    toggleFavoriteRegion({ city, region, label: station.name });
  };

  // 상세 데이터에서 조회할 지역을 바꾸고 기존 차트/목록 선택을 초기화합니다.
  const applyDataRegion = (region: RegionState | null) => {
    setShowDataRegionPicker(false);
    setDataRegionSearchText('');
    setDataMetric('pm10');
    setSelectedChartDate(null);
    setDataItems([]);
    setError('');
    setDetailRegion(region);
  };

  // 상세 데이터 지역 검색 결과를 선택했을 때 조회 지역으로 적용합니다.
  const selectDataRegionSuggestion = (station: StationDustItem) => {
    const city = station.sido;
    const region = station.city || station.name;
    if (!city || !region) return;
    applyDataRegion({ city, region, label: station.name });
  };

  // 현재 GPS 좌표와 가장 가까운 측정소를 찾아 앱의 기준 지역으로 설정합니다.
  const applyNearestGpsRegion = async () => {
    setIsLocating(true);
    setLocationMessage('위치 권한을 확인하는 중입니다.');
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permission = currentPermission.granted ? currentPermission : await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('위치 권한 필요', '모바일 앱은 현재 위치 기준으로 시작해야 합니다. 권한을 허용하지 않아 앱을 종료합니다.', [
          { text: '확인', onPress: () => BackHandler.exitApp() },
        ]);
        setTimeout(() => BackHandler.exitApp(), 600);
        return;
      }

      setLocationMessage('현재 위치를 가져오는 중입니다.');
      const hasLocationService = await Location.hasServicesEnabledAsync();
      if (!hasLocationService) {
        Alert.alert('위치 서비스 꺼짐', '기기의 위치 서비스가 꺼져 있어 현재 위치를 확인할 수 없습니다. 위치 서비스를 켠 뒤 다시 실행해 주세요.', [
          { text: '확인', onPress: () => BackHandler.exitApp() },
        ]);
        setTimeout(() => BackHandler.exitApp(), 800);
        return;
      }

      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 10 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const gpsCoords = normalizeLatLng(position.coords.latitude, position.coords.longitude);
      if (!gpsCoords) {
        setLocationMessage('현재 위치 좌표가 올바르지 않습니다. 에뮬레이터 Location에서 Latitude와 Longitude 입력값을 확인해 주세요.');
        return;
      }
      loadWeather(gpsCoords.lat, gpsCoords.lng);

      let stations = mapStations;
      if (stations.length === 0) {
        setLocationMessage('가까운 측정소를 찾는 중입니다.');
        const cachedStations = await loadStationCache();
        if (cachedStations?.length) {
          setStationItems(cachedStations);
          stations = cachedStations.filter((station) => normalizeLatLng(station.lat, station.lng));
        }
      }

      if (stations.length === 0) {
        const stationData = await getKoreaStations();
        const nextStations = (stationData.items ?? []) as StationDustItem[];
        setStationItems(nextStations);
        saveStationCache(nextStations);
        stations = nextStations.filter((station) => normalizeLatLng(station.lat, station.lng));
      }

      const nearest = stations
        .map((station) => {
          const stationCoords = normalizeLatLng(station.lat, station.lng);
          if (!stationCoords) return null;
          return {
            station,
            distance: haversineKm(gpsCoords.lat, gpsCoords.lng, stationCoords.lat, stationCoords.lng),
          };
        })
        .filter((item): item is { station: StationDustItem; distance: number } => item !== null)
        .sort((a, b) => a.distance - b.distance)[0];

      if (!nearest) {
        setLocationMessage('가까운 측정소를 찾지 못했습니다.');
        return;
      }

      const city = nearest.station.sido || DEFAULT_CITY;
      const region = nearest.station.city || nearest.station.name || DEFAULT_REGION;
      const nextRegion = { city, region, label: nearest.station.name };
      setGpsRegion(nextRegion);
      applyRegion(nextRegion, `${city} ${region} 기준으로 설정했습니다.`);
    } catch (caught) {
      setLocationMessage(caught instanceof Error ? caught.message : '현재 위치를 불러오지 못했습니다.');
    } finally {
      setIsLocating(false);
    }
  };

  // 사용자가 선택한 홈 기준 지역을 저장합니다.
  useEffect(() => {
    let cancelled = false;

    const loadRegionStore = async () => {
      try {
        const storedState = await loadStoredAppState();
        if (cancelled) return;
        const nextRegion = storedState.selectedRegion;
        const nextGpsRegion = storedState.gpsRegion;
        const nextFavorites = storedState.favoriteRegions;
        const canUseStoredRegion = nextRegion && (!isSameRegion(nextRegion, DEFAULT_REGION_STATE) || nextFavorites.length > 0);
        if (nextGpsRegion) setGpsRegion(nextGpsRegion);
        if (canUseStoredRegion) setSelectedRegion(nextRegion);
        if (!canUseStoredRegion && nextGpsRegion) setSelectedRegion(nextGpsRegion);
        setFavoriteRegions(nextFavorites);
        setMapRecentSearches(storedState.mapRecentSearches);
        setNotificationSettings(storedState.notificationSettings);
        setServerPushToken(storedState.notificationToken);
        setCalendarEvents(storedState.calendarEvents);
        setHasLoadedRegionStore(true);
      } catch {
        if (!cancelled) {
          setHasLoadedRegionStore(false);
        }
      }
    };

    loadRegionStore();
    return () => {
      cancelled = true;
    };
  }, []);

  // GPS로 잡은 실제 위치 기준 지역을 저장합니다.
  useEffect(() => {
    if (!hasLoadedRegionStore || !selectedRegion) return;
    saveSelectedRegion(selectedRegion);
  }, [hasLoadedRegionStore, selectedRegion]);

  // 즐겨찾기 목록이 바뀔 때 저장소와 동기화합니다.
  useEffect(() => {
    if (!hasLoadedRegionStore || !gpsRegion) return;
    saveGpsRegion(gpsRegion);
  }, [gpsRegion, hasLoadedRegionStore]);

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    saveCalendarEvents(calendarEvents);
  }, [calendarEvents, hasLoadedRegionStore]);

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    let cancelled = false;
    const syncVersion = calendarNotificationSyncRef.current + 1;
    calendarNotificationSyncRef.current = syncVersion;

    const syncCalendarNotifications = async () => {
      await wait(250);
      if (cancelled || calendarNotificationSyncRef.current !== syncVersion) return;
      const notificationIds = await loadCalendarNotificationIds();
      await cancelCalendarEventNotifications(notificationIds);
      if (cancelled || calendarNotificationSyncRef.current !== syncVersion) return;

      if (!notificationSettings.enabled || !notificationSettings.calendarReminders) {
        await saveCalendarNotificationIds([]);
        return;
      }

      const riskByEvent = buildCalendarRiskByEvent(calendarEvents, {
        currentPm10,
        hourlyItems,
        eventLocationForecasts: calendarLocationForecasts,
        prediction,
        todayDateLabel,
        weather,
        weatherHourlyItems,
        weatherMidTermItems,
      });
      const nextIds: string[] = [];
      if (notificationSettings.calendarReminders) {
        for (const event of calendarEvents) {
          if (cancelled || calendarNotificationSyncRef.current !== syncVersion) return;
          const notificationIdsForEvent = await scheduleCalendarEventNotifications(event, riskByEvent[event.id], todayDateLabel).catch(() => []);
          if (cancelled || calendarNotificationSyncRef.current !== syncVersion) return;
          nextIds.push(...notificationIdsForEvent);
        }
      }
      if (cancelled || calendarNotificationSyncRef.current !== syncVersion) return;
      await saveCalendarNotificationIds(nextIds);
    };

    syncCalendarNotifications();
    return () => {
      cancelled = true;
    };
  }, [
    calendarEvents,
    calendarLocationForecasts,
    currentPm10,
    hasLoadedRegionStore,
    hourlyItems,
    notificationSettings.calendarReminders,
    notificationSettings.enabled,
    prediction,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  ]);

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    let cancelled = false;
    const eventsWithLocation = calendarEvents.filter((event) => !!calendarEventLocationKey(event));
    const uniqueEvents = Array.from(new Map(eventsWithLocation.map((event) => [calendarEventLocationKey(event), event])).values());
    if (uniqueEvents.length === 0) {
      setCalendarLocationForecasts({});
      return;
    }

    Promise.all(uniqueEvents.map((event) => loadCalendarLocationForecast(event).catch(() => null))).then((entries) => {
      if (cancelled) return;
      setCalendarLocationForecasts(Object.fromEntries(entries.filter((entry): entry is [string, CalendarLocationForecast] => !!entry)));
    });

    return () => {
      cancelled = true;
    };
  }, [calendarEvents, hasLoadedRegionStore, todayDateLabel]);

  useEffect(() => {
    if (!selectedRegion || mapStations.length === 0) return;
    const station = findStationForRegion(selectedRegion);
    const coords = normalizeLatLng(station?.lat, station?.lng);
    if (!coords) return;
    loadWeather(coords.lat, coords.lng);
  }, [mapStations.length, selectedRegion]);

  useEffect(() => {
    const coords = normalizeLatLng(selectedStation?.lat, selectedStation?.lng);
    if (!coords) {
      setSelectedStationWeather(null);
      return;
    }
    let isActive = true;
    loadStoredWeather(coords.lat, coords.lng)
      .then((data) => {
        if (!isActive) return;
        setSelectedStationWeather(data.weather ?? weatherStateFromStation(selectedStation));
      })
      .catch(() => {
        if (isActive) setSelectedStationWeather(weatherStateFromStation(selectedStation));
      });
    return () => {
      isActive = false;
    };
  }, [selectedStation?.lat, selectedStation?.lng, selectedStation?.name, selectedStation?.weatherTime]);

  // 지도 검색의 최근 검색 목록을 저장합니다.
  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    saveFavoriteRegions(favoriteRegions);
  }, [favoriteRegions, hasLoadedRegionStore]);

  // 알림 설정 토글과 기준값을 저장합니다.
  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    saveMapRecentSearches(mapRecentSearches);
  }, [hasLoadedRegionStore, mapRecentSearches]);

  // 알림 설정을 저장합니다.
  // Server-side morning weather alerts need the Expo push token, selected region, and a small event summary.
  // Local calendar reminders stay local; this sync only updates the backend device record.
  useEffect(() => {
    if (!hasLoadedRegionStore || !selectedRegion || IS_EXPO_GO) return;
    let cancelled = false;

    const syncServerNotificationDevice = async () => {
      if (!notificationSettings.enabled) {
        if (!serverPushToken) return;
        await registerNotificationDevice({
          city: selectedRegion.city,
          enabled: false,
          expoPushToken: serverPushToken,
          region: selectedRegion.region,
          weatherMorningAlerts: false,
        }).catch(() => {});
        return;
      }

      let token = serverPushToken;
      if (!token) {
        token = await requestDustPushToken().catch(() => null);
        if (!token || cancelled) return;
        setServerPushToken(token);
        await saveNotificationToken(token);
      }

      const calendarEventSummary = calendarEvents
        .filter((event) => event.date >= todayDateLabel)
        .slice(0, 30)
        .map((event) => ({ date: event.date, time: event.time, title: event.title }));

      await registerNotificationDevice({
        calendarEvents: calendarEventSummary,
        city: selectedRegion.city,
        enabled: notificationSettings.enabled,
        expoPushToken: token,
        region: selectedRegion.region,
        weatherMorningAlerts: notificationSettings.weatherMorningAlerts,
      }).catch(() => {});
    };

    syncServerNotificationDevice();
    return () => {
      cancelled = true;
    };
  }, [calendarEvents, hasLoadedRegionStore, notificationSettings.enabled, notificationSettings.weatherMorningAlerts, selectedRegion, serverPushToken, todayDateLabel]);

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    saveNotificationSettings(notificationSettings);
  }, [hasLoadedRegionStore, notificationSettings]);

  // 현재 탭과 선택 지역에 맞는 데이터를 불러옵니다.
  useEffect(() => {
    if (!hasLoadedRegionStore || hasTriedInitialLocation) return;
    setHasTriedInitialLocation(true);
    applyNearestGpsRegion();
  }, [hasLoadedRegionStore, hasTriedInitialLocation]);

  // 지도 탭 진입 시 GPS 기준 측정소로 초기 포커스를 한 번만 보냅니다.
  useEffect(() => {
    if (!selectedRegion) return;
    if (activeTab === 'home') loadDashboard();
    if (activeTab === 'map' && stationItems.length === 0) loadStations();
    if (detailRegion) {
      if (dataDetailMode === 'weather') {
        loadWeatherDetail();
      } else {
        loadPastData(dataRangeDays);
      }
      if (stationItems.length === 0) loadStations();
    }
    if (activeTab === 'calendar' && (!currentItem || !prediction || pastItems.length === 0)) loadDashboard();
  }, [activeTab, dataRangeDays, dataDetailMode, activeCity, activeRegion, selectedRegion, detailRegion]);

  // 지도 탭을 5분 이상 보지 않으면 선택 마커와 검색 상태를 초기화합니다.
  useEffect(() => {
    const previousTab = previousTabRef.current;
    if (previousTab === 'calendar' && activeTab !== 'calendar') {
      resetBriefingMessages();
    }
    if (previousTab === 'map' && activeTab !== 'map') {
      setSelectedStation(null);
      setMapViewKey((key) => key + 1);
    }
    if (previousTab === 'home' && activeTab !== 'home') {
      Keyboard.dismiss();
      setShowFavoritePicker(false);
      setShowHomeRegionSearch(false);
      setHomeRegionSearchText('');
    }
    previousTabRef.current = activeTab;
  }, [activeTab]);

  // 홈의 즐겨찾기/지역 검색 패널 등장 애니메이션입니다.
  useEffect(() => {
    if (activeTab === 'map') return;
    const timer = setTimeout(() => {
      setSelectedStation(null);
      setMapSearchText('');
      setMapSearchMessage('');
      setShowSearchSuggestions(false);
      setMapViewKey((key) => key + 1);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // 상세 데이터 지역 검색 패널 등장 애니메이션입니다.
  useEffect(() => {
    if (activeTab !== 'home' || (!showFavoritePicker && !showHomeRegionSearch)) {
      homePanelOpacity.setValue(0);
      homePanelTranslateY.setValue(-8);
      return;
    }
    homePanelOpacity.setValue(0);
    homePanelTranslateY.setValue(-8);
    Animated.parallel([
      Animated.timing(homePanelOpacity, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.spring(homePanelTranslateY, {
        toValue: 0,
        damping: 18,
        stiffness: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab, homePanelOpacity, homePanelTranslateY, showFavoritePicker, showHomeRegionSearch]);

  // 지도 검색 전체 화면 등장 애니메이션입니다.
  useEffect(() => {
    if (!detailRegion || !showDataRegionPicker) {
      dataRegionPickerOpacity.setValue(0);
      dataRegionPickerTranslateY.setValue(-8);
      return;
    }
    dataRegionPickerOpacity.setValue(0);
    dataRegionPickerTranslateY.setValue(-8);
    Animated.parallel([
      Animated.timing(dataRegionPickerOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(dataRegionPickerTranslateY, {
        toValue: 0,
        damping: 16,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dataRegionPickerOpacity, dataRegionPickerTranslateY, detailRegion, showDataRegionPicker]);

  // 키보드 표시 상태를 추적해 챗봇 입력창이 가려지지 않게 합니다.
  useEffect(() => {
    if (activeTab !== 'map' || !isMapSearchFocused) {
      mapSearchOverlayOpacity.setValue(0);
      mapSearchOverlayTranslateY.setValue(18);
      return;
    }
    mapSearchOverlayOpacity.setValue(0);
    mapSearchOverlayTranslateY.setValue(18);
    Animated.parallel([
      Animated.timing(mapSearchOverlayOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(mapSearchOverlayTranslateY, {
        toValue: 0,
        damping: 17,
        stiffness: 190,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab, isMapSearchFocused, mapSearchOverlayOpacity, mapSearchOverlayTranslateY]);

  // 키보드 높이를 추적해 입력 UI가 하단 탭에 가려지지 않게 합니다.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [activeTab]);

  // 알림 설정 저장 결과를 하단 토스트로 보여줍니다.
  useEffect(() => {
    if (activeTab !== 'calendar' || !isKeyboardVisible) return;
    const timer = setTimeout(() => mainScrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [activeTab, briefingMessages.length, isBriefingLoading, isKeyboardVisible, keyboardHeight]);

  // Android 뒤로가기: 지도 검색/선택 상태를 닫고 앱 종료를 막습니다.
  useEffect(() => {
    if (!notificationMessage) return;
    notificationToastOpacity.stopAnimation();
    notificationToastTranslateY.stopAnimation();
    notificationToastOpacity.setValue(0);
    notificationToastTranslateY.setValue(16);
    Animated.parallel([
      Animated.timing(notificationToastOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(notificationToastTranslateY, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(notificationToastOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(notificationToastTranslateY, {
          toValue: 12,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }, 2200);
    return () => clearTimeout(timer);
  }, [notificationMessage, notificationToastOpacity, notificationToastTranslateY]);

  // Android 뒤로가기: 홈 검색/즐겨찾기 패널이 열려 있으면 패널만 닫습니다.
  useEffect(() => {
    if (activeTab !== 'map') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      if (isMapSearchFocused) {
        closeMapSearch();
        return true;
      }
      if (selectedStation) {
        setSelectedStation(null);
        return true;
      }
      if (mapSearchText || mapSearchMessage || showSearchSuggestions) {
        setMapSearchText('');
        setMapSearchMessage('');
        setShowSearchSuggestions(false);
        return true;
      }
      setSelectedStation(null);
      setMapSearchText('');
      setMapSearchMessage('');
      setShowSearchSuggestions(false);
      setActiveTab('home');
      return true;
    });
    return () => subscription.remove();
  }, [activeTab, isMapSearchFocused, mapSearchMessage, mapSearchText, selectedStation, showSearchSuggestions]);

  // Android 뒤로가기: 상세 데이터 지역 검색 패널이 열려 있으면 패널만 닫습니다.
  useEffect(() => {
    if (activeTab !== 'home' || (!showHomeRegionSearch && !showFavoritePicker)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      if (showHomeRegionSearch) {
        setShowHomeRegionSearch(false);
        setHomeRegionSearchText('');
        return true;
      }
      if (showFavoritePicker) {
        setShowFavoritePicker(false);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, showFavoritePicker, showHomeRegionSearch]);

  useEffect(() => {
    if (!detailRegion || !showDataRegionPicker) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      setShowDataRegionPicker(false);
      setDataRegionSearchText('');
      return true;
    });
    return () => subscription.remove();
  }, [detailRegion, showDataRegionPicker]);

  useEffect(() => {
    if (!detailRegion || showDataRegionPicker) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      resetDataTab();
      return true;
    });
    return () => subscription.remove();
  }, [detailRegion, showDataRegionPicker]);

  const switchTab = (nextTab: TabKey) => {
    if (nextTab === activeTab) return;
    Keyboard.dismiss();
    setActiveTab(nextTab);
  };

  const tabIcons: Record<TabKey, keyof typeof Ionicons.glyphMap> = {
    account: 'settings',
    calendar: 'calendar',
    home: 'home',
    map: 'map',
  };

  const tabBar = (
    <View style={[styles.tabBar, { borderTopColor: accentBorderTone }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const handleTabPress = () => {
          switchTab(tab.key);
        };
        return (
          <Pressable
            key={tab.key}
            onPress={handleTabPress}
            style={({ pressed }) => [styles.tabItem, isActive && { backgroundColor: accentSoftTone }, pressed && styles.pressedFeedback]}
          >
            <Ionicons name={tabIcons[tab.key]} size={19} color={isActive ? accentTone : '#687180'} />
            <Text style={[styles.tabText, isActive && { color: accentTone }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!selectedRegion) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={styles.locationGate}>
          <ActivityIndicator color="#2fbf71" size="large" />
          <Text style={styles.locationGateTitle}>현재 위치를 확인하고 있어요</Text>
          <Text style={styles.locationGateText}>{locationMessage || '위치 권한을 허용하면 지금 있는 지역으로 앱을 시작합니다.'}</Text>
          <Pressable disabled={isLocating} onPress={applyNearestGpsRegion} style={({ pressed }) => [styles.locationGateButton, pressed && styles.pressedFeedback]}>
            <Text style={styles.locationGateButtonText}>{isLocating ? '확인 중' : '위치 권한 다시 요청'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const resolvedDataRegion = activeDataRegion ?? selectedRegion;
  const dataRegionPickerContent = showDataRegionPicker ? (
    <Animated.View
      style={[
        styles.dataRegionPicker,
        {
          opacity: dataRegionPickerOpacity,
          transform: [{ translateY: dataRegionPickerTranslateY }],
        },
      ]}
    >
      <Text style={styles.favoritePickerTitle}>지역 검색</Text>
      <TextInput
        value={dataRegionSearchText}
        onChangeText={setDataRegionSearchText}
        onFocus={() => {
          if (stationItems.length === 0) loadStations();
        }}
                  placeholder={"\uC9C0\uC5ED, \uCE21\uC815\uC18C, \uC8FC\uC18C \uAC80\uC0C9"}
                  placeholderTextColor="#8a94a3"
        returnKeyType="search"
        style={styles.homeRegionSearchInput}
      />
      {!!dataRegionSearchText.trim() && dataRegionSuggestions.length === 0 && !isLoadingStations && (
        <Text style={styles.homeRegionSearchEmpty}>일치하는 지역을 찾지 못했습니다.</Text>
      )}
      {dataRegionSuggestions.length > 0 && (
        <View style={styles.homeRegionSuggestionList}>
          {dataRegionSuggestions.map((station, index) => {
            const regionName = station.city || station.name || '';
            return (
              <Pressable
                key={`${stationIdentity(station)}-${index}-data-search`}
                onPress={() => selectDataRegionSuggestion(station)}
                style={({ pressed }) => [styles.homeRegionSuggestionItem, pressed && styles.pressedFeedback]}
              >
                <View style={styles.homeRegionSuggestionTextGroup}>
                  <Text style={styles.homeRegionSuggestionTitle}>{station.sido} {regionName}</Text>
                  <Text style={styles.homeRegionSuggestionMeta}>{[station.name, station.addr].filter(Boolean).join(' / ')}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Animated.View>
  ) : null;
  const bottomToast = !!notificationMessage && (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bottomToast,
        {
          bottom: isKeyboardVisible ? keyboardHeight + 24 : 88,
          opacity: notificationToastOpacity,
          transform: [{ translateY: notificationToastTranslateY }],
        },
      ]}
    >
      <Text style={styles.bottomToastText}>{notificationMessage}</Text>
    </Animated.View>
  );

  if (detailRegion) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <ScrollView
          ref={mainScrollRef}
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl colors={[accentTone]} refreshing={isLoadingPast} tintColor={accentTone} onRefresh={() => dataDetailMode === 'weather' ? loadWeatherDetail() : loadPastData(dataRangeDays)} />}
        >
          <View style={styles.detailScreenHeader}>
            <Pressable onPress={resetDataTab} style={({ pressed }) => [styles.detailBackButton, pressed && styles.pressedFeedback]}>
              <Ionicons name="chevron-back" size={22} color="#141821" />
            </Pressable>
            <View style={styles.detailHeaderTextGroup}>
              <Text style={styles.title}>{resolvedDataRegion.city} {resolvedDataRegion.region}</Text>
              <Text style={styles.detailHeaderSubText}>상세 데이터</Text>
            </View>
          </View>
          <View style={[styles.segmentCard, { borderColor: '#d9dee5', shadowColor: accentTone }]}>
            <View style={styles.segmentRow}>
              {[
                { key: 'dust' as const, label: '미세먼지' },
                { key: 'weather' as const, label: '날씨' },
              ].map((mode) => (
                <Pressable
                  key={mode.key}
                  onPress={() => setDataDetailMode(mode.key)}
                  style={({ pressed }) => [styles.segmentButton, dataDetailMode === mode.key && { backgroundColor: accentTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}
                >
                  <Text style={[styles.segmentText, dataDetailMode === mode.key && styles.segmentTextActive]}>{mode.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {dataDetailMode === 'dust' ? (
            <DataPanel
              dataMetric={dataMetric}
              dataRangeDays={dataRangeDays}
              error={error}
              accentBorderTone={accentBorderTone}
              accentSoftTone={accentSoftTone}
              accentTone={accentTone}
              isLoadingPast={isLoadingPast}
              items={dataItems}
              onMetricChange={setDataMetric}
              onRangeChange={setDataRangeDays}
              onSelectChartDate={setSelectedChartDate}
              onToggleRegionPicker={() => setShowDataRegionPicker((visible) => !visible)}
              region={resolvedDataRegion}
              regionPickerContent={dataRegionPickerContent}
              selectedChartDate={selectedChartDate}
              showRegionPicker={showDataRegionPicker}
            />
          ) : (
            <WeatherDataPanel
              accentBorderTone={accentBorderTone}
              accentSoftTone={accentSoftTone}
              accentTone={accentTone}
              currentWeather={detailWeather}
              error={error}
              isLoading={isLoadingPast}
              dataRangeDays={dataRangeDays}
              items={detailWeatherItems}
              metric={weatherDataMetric}
              onMetricChange={setWeatherDataMetric}
              onRangeChange={setDataRangeDays}
              onToggleRegionPicker={() => setShowDataRegionPicker((visible) => !visible)}
              region={resolvedDataRegion}
              regionPickerContent={dataRegionPickerContent}
              showRegionPicker={showDataRegionPicker}
            />
          )}
        </ScrollView>
        {bottomToast}
      </SafeAreaView>
    );
  }

  if (activeTab === 'map') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <FullMapScreen
          accentBorderTone={accentBorderTone}
          accentTone={accentTone}
          bottomToast={bottomToast}
          dismissMapSearchKeyboard={dismissMapSearchKeyboard}
          favoriteRegions={favoriteRegions}
          focusGpsMapRegion={focusGpsMapRegion}
          focusMapStation={focusMapStation}
          handleMapMessage={handleMapMessage}
          isLoadingStations={isLoadingStations}
          isMapSearchFocused={isMapSearchFocused}
          mapMarkerMode={mapMarkerMode}
          mapRecentSearches={mapRecentSearches}
          mapSearchInputRef={mapSearchInputRef}
          mapSearchMessage={mapSearchMessage}
          mapSearchOverlayInputRef={mapSearchOverlayInputRef}
          mapSearchOverlayOpacity={mapSearchOverlayOpacity}
          mapSearchOverlayTranslateY={mapSearchOverlayTranslateY}
          mapSearchText={mapSearchText}
          mapUrl={fullMapUrl}
          mapViewKey={mapViewKey}
          mapWebViewRef={mapWebViewRef}
          onBackHome={() => switchTab('home')}
          onClearRecentSearches={() => setMapRecentSearches([])}
          onRemoveRecentSearch={removeMapRecentSearch}
          onToggleFavorite={(station) => {
            const city = station.sido;
            const region = station.city || station.name;
            if (city && region) toggleFavoriteRegion({ city, region, label: station.name });
          }}
          openStationDetail={openStationDetail}
          searchSuggestions={searchSuggestions}
          selectedStation={selectedStation}
          selectedStationWeather={selectedStationWeather}
          setIsMapSearchFocused={setIsMapSearchFocused}
          setMapSearchMessage={setMapSearchMessage}
          setMapSearchText={setMapSearchText}
          setSelectedStation={setSelectedStation}
          setShowSearchSuggestions={setShowSearchSuggestions}
          showSearchSuggestions={showSearchSuggestions}
          switchMapMarkerMode={switchMapMarkerMode}
        />
        {tabBar}
      </SafeAreaView>
    );
  }

  if (activeTab === 'calendar') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <CalendarPanel
          accentBorderTone={accentBorderTone}
          accentSoftTone={accentSoftTone}
          accentTone={accentTone}
          events={calendarEvents}
          defaultLocation={calendarDefaultLocation}
          eventLocationForecasts={calendarLocationForecasts}
          currentPm10={currentPm10}
          hourlyItems={hourlyItems}
          mapPickerUrl={calendarMapPickerUrl}
          onAddEvent={addCalendarEvent}
          onAddEvents={addCalendarEvents}
          onRemoveEvent={removeCalendarEvent}
          onUpdateEvent={updateCalendarEvent}
          onUpdateEventSeries={updateCalendarEventSeries}
          prediction={prediction}
          todayDateLabel={todayDateLabel}
          weather={weather}
          weatherHourlyItems={weatherHourlyItems}
          weatherMidTermItems={weatherMidTermItems}
        />
        {tabBar}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoidingRoot}
      >
      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl colors={[accentTone]} refreshing={isRefreshingCurrent} tintColor={accentTone} onRefresh={loadCurrentDust} />}
      >
        {activeTab === 'home' && <Text style={[styles.kicker, { color: accentTone }]}>DUST HEALTH AI</Text>}
        {activeTab === 'home' ? (
          <View style={styles.homeHeader}>
            <View style={styles.homeTitleRow}>
              <Pressable
                disabled={favoriteRegions.length === 0}
                accessibilityLabel="즐겨찾기 지역 선택"
                onPress={toggleFavoritePicker}
                style={({ pressed }) => [styles.homeTitleButton, pressed && favoriteRegions.length > 0 && styles.pressedFeedback]}
              >
                <View style={styles.homeTitleInline}>
                  <Text numberOfLines={1} style={styles.title}>{activeCity} {activeRegion}</Text>
                  <Ionicons color="#141821" name="chevron-down" size={20} style={styles.homeTitleChevron} />
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel="홈에서 지역 검색"
                onPress={openHomeRegionSearch}
                style={({ pressed }) => [styles.regionAddButton, showHomeRegionSearch && { backgroundColor: accentSoftTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}
              >
                <Ionicons color={showHomeRegionSearch ? accentTone : '#687180'} name="search-outline" size={15} />
                <Text style={[styles.regionAddText, showHomeRegionSearch && { color: accentTone }]}>지역 검색</Text>
              </Pressable>
              <View style={styles.homeWeatherChip}>
                <Ionicons color="#f3b43f" name={getWeatherIcon(weather?.label)} size={20} />
                <View>
                  <Text style={styles.homeWeatherValue}>
                    {typeof weather?.temperature === 'number' ? `${Math.round(weather.temperature)}°` : '--°'}
                  </Text>
                  <Text style={styles.homeWeatherLabel}>{weather?.label ?? '날씨'}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.homeBasisText}>{formatCurrentBasis(currentItem)}</Text>
          </View>
        ) : activeTab === 'account' ? null : (
          <Text style={styles.title}>{tabs.find((tab) => tab.key === activeTab)?.label}</Text>
        )}
        {activeTab === 'home' && showFavoritePicker && (
          <Animated.View style={[styles.favoritePicker, { opacity: homePanelOpacity, transform: [{ translateY: homePanelTranslateY }] }]}>
            <Text style={styles.favoritePickerTitle}>즐겨찾기 지역 선택</Text>
            <View style={styles.favoritePickerList}>
              {favoriteRegions.map((region) => {
                const selected = isSameRegion(region, selectedRegion);
                return (
                  <View
                    key={`${region.city}-${region.region}`}
                    style={[styles.favoritePickerItem, selected && { backgroundColor: accentSoftTone, borderColor: accentTone }]}
                  >
                    <Pressable
                      onPress={() => applyRegion(region, `${region.city} ${region.region} 기준으로 변경했습니다.`)}
                      style={({ pressed }) => [styles.favoritePickerSelectArea, pressed && styles.pressedFeedback]}
                    >
                      <Text style={[styles.favoritePickerText, selected && styles.favoritePickerTextActive]}>
                        {region.city} {region.region}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="즐겨찾기 지역 삭제"
                      onPress={() => removeFavoriteRegion(region)}
                      style={({ pressed }) => [styles.favoritePickerRemoveButton, pressed && styles.pressedFeedback]}
                    >
                      <Text style={styles.favoriteRemoveText}>삭제</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {gpsRegion && !isSameRegion(gpsRegion, selectedRegion) && (
              <Pressable
                onPress={() => applyRegion(gpsRegion, `${gpsRegion.city} ${gpsRegion.region} 기준으로 돌아왔습니다.`)}
                style={({ pressed }) => [styles.gpsRegionButton, pressed && styles.pressedFeedback]}
              >
                <View style={styles.gpsRegionButtonIcon}>
                  <Text style={styles.gpsRegionButtonIconText}>⌖</Text>
                </View>
                <View style={styles.gpsRegionButtonBody}>
                  <Text style={styles.gpsRegionButtonLabel}>GPS 기준 지역</Text>
                  <Text style={styles.gpsRegionButtonText}>{gpsRegion.city} {gpsRegion.region}</Text>
                </View>
              </Pressable>
            )}
          </Animated.View>
        )}
        {activeTab === 'home' && showHomeRegionSearch && (
          <Animated.View style={[styles.homeRegionSearchPanel, { opacity: homePanelOpacity, transform: [{ translateY: homePanelTranslateY }] }]}>
            <Text style={styles.favoritePickerTitle}>지역 검색</Text>
            <View style={styles.homeRegionSearchInputRow}>
              <TextInput
                autoFocus
                value={homeRegionSearchText}
                onChangeText={setHomeRegionSearchText}
                placeholder="시군구, 읍면동, 측정소 이름"
                placeholderTextColor="#8a94a3"
                returnKeyType="search"
                style={styles.homeRegionSearchInput}
              />
              {gpsRegion && (
                <Pressable
                  accessibilityLabel="GPS 기준 지역으로 설정"
                  disabled={isSameRegion(gpsRegion, selectedRegion)}
                  onPress={() => applyRegion(gpsRegion, `${gpsRegion.city} ${gpsRegion.region} 기준으로 설정했습니다.`)}
                  style={({ pressed }) => [
                    styles.homeRegionSearchGpsButton,
                    isSameRegion(gpsRegion, selectedRegion) && styles.homeGpsButtonDisabled,
                    pressed && !isSameRegion(gpsRegion, selectedRegion) && styles.pressedFeedback,
                  ]}
                >
                  <Text style={[styles.homeGpsIcon, !isSameRegion(gpsRegion, selectedRegion) && { color: accentTone }]}>⌖</Text>
                </Pressable>
              )}
            </View>
            {isLoadingStations && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={accentTone} />
                <Text style={styles.mutedText}>지역 목록을 불러오는 중입니다.</Text>
              </View>
            )}
            {!!homeRegionSearchText.trim() && homeRegionSuggestions.length === 0 && !isLoadingStations && (
              <Text style={styles.homeRegionSearchEmpty}>일치하는 지역을 찾지 못했습니다. 시군구나 읍면동 이름을 조금 다르게 입력해보세요.</Text>
            )}
            {homeRegionSuggestions.length > 0 && (
              <View style={styles.homeRegionSuggestionList}>
                  {homeRegionSuggestions.map((station, index) => {
                  const regionName = station.city || station.name || '';
                  const alreadyFavorite = favoriteRegions.some((region) => isSameRegion(region, { city: station.sido ?? '', region: regionName }));
                  return (
                    <View
                      key={`${stationIdentity(station)}-${index}-home`}
                      style={styles.homeRegionSuggestionItem}
                    >
                      <Pressable
                        onPress={() => selectHomeRegionSuggestion(station)}
                        style={({ pressed }) => [styles.homeRegionSuggestionTextGroup, pressed && styles.pressedFeedback]}
                      >
                        <Text style={styles.homeRegionSuggestionTitle}>{station.sido} {regionName}</Text>
                        <Text style={styles.homeRegionSuggestionMeta}>{[station.name, station.addr].filter(Boolean).join(' / ')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={alreadyFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                        onPress={() => toggleHomeSuggestionFavorite(station)}
                        style={({ pressed }) => [styles.homeRegionSuggestionStarButton, pressed && styles.pressedFeedback]}
                      >
                        <Text style={[styles.homeRegionSuggestionStar, alreadyFavorite && styles.homeRegionSuggestionStarActive]}>★</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </Animated.View>
        )}

        {activeTab === 'home' && (
          <HomePanel
            currentPm10={currentPm10}
            currentPm25={currentPm25}
            currentO3={currentO3}
            accentSoftTone={accentSoftTone}
            accentTone={accentTone}
            calendarEvents={calendarEvents}
            eventLocationForecasts={calendarLocationForecasts}
            onOpenCalendar={() => setActiveTab('calendar')}
            onOpenDetail={openSelectedRegionDetail}
            onOpenMap={() => {
              if (stationItems.length === 0) loadStations();
              setMapViewKey((key) => key + 1);
              setActiveTab('map');
            }}
            mapPreviewUrl={homeMapPreviewUrl}
            mapPreviewLabel={homeMapPreviewLabel}
            hourlyItems={hourlyItems}
            weatherHourlyItems={weatherHourlyItems}
            weatherMidTermItems={weatherMidTermItems}
            prediction={prediction}
            todayDateLabel={todayDateLabel}
            weather={weather}
          />
        )}

        {activeTab === 'account' && (
          <RegionPanel
            favoriteRegions={favoriteRegions}
            accentBorderTone={accentBorderTone}
            accentSoftTone={accentSoftTone}
            accentTone={accentTone}
            isLocating={isLocating}
            isSavingNotificationSettings={isSavingNotificationSettings}
            locationMessage={locationMessage}
            notificationsUnavailable={IS_EXPO_GO}
            notificationSettings={notificationSettings}
            onRemoveFavorite={removeFavoriteRegion}
            onToggleNotificationSetting={updateNotificationSetting}
            onUseCurrentLocation={applyNearestGpsRegion}
            selectedRegion={selectedRegion}
          />
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      {isRegionTransitioning && activeTab === 'home' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.regionLoadingOverlay,
            {
              opacity: regionTransitionOpacity,
              transform: [{ scale: regionTransitionScale }],
            },
          ]}
        >
          <View style={styles.regionLoadingCard}>
            <ActivityIndicator color={accentTone} />
            <Text style={styles.regionLoadingTitle}>{activeCity} {activeRegion}</Text>
            <Text style={styles.regionLoadingText}>지역 데이터를 불러오는 중입니다.</Text>
          </View>
        </Animated.View>
      )}
      {bottomToast}
      {tabBar}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}



