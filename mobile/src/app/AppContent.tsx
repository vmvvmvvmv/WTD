import { useCalendarLocationForecasts } from '../features/calendar/useCalendarLocationForecasts';
import { loadStoredWeather, weatherStateFromStation } from '../features/weather/weatherData';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Easing,
  ImageBackground,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { WebView as WebViewType } from 'react-native-webview';
import { CalendarPanel } from '../components/calendar/CalendarPanel';
import { buildCalendarRiskByEvent } from '../components/calendar/calendarForecast';
import { withoutFollowingOccurrences } from '../components/calendar/calendarRepeat';
import { buildOutingAccentTheme } from '../theme/appTheme';
import { bauhausColors, textColors } from '../theme/bauhaus';
import { DataPanel } from '../components/data/DataPanel';
import { WeatherDataPanel } from '../components/data/WeatherDataPanel';
import type { WeatherDataMetricKey } from '../components/data/WeatherDataPanel';
import { HomePanel } from '../components/home/HomePanel';
import { FullMapScreen } from '../components/map/FullMapScreen';
import { RegionPanel } from '../components/settings/RegionPanel';
import { AppActionIcon } from '../components/shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../components/shared/WeatherIcon';
import { DETAIL_DATA_ENABLED } from '../config/features';
import { styles } from '../styles/appStyles';
import { AppTabBar } from '../navigation/AppTabBar';
import { getTabRoute } from '../navigation/routes';
import {
  ApiHttpError,
  getCurrentDust,
  getKoreaStations,
  getOptionalPastDust,
  getPastWeather,
  postBriefingMessage,
  registerNotificationDevice,
} from '../api/dustEndpoints';
import {
  DATA_LIST_PAGE_SIZE,
  DEFAULT_CITY,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_OUTFIT_SETTINGS,
  DEFAULT_REGION,
  DEFAULT_REGION_STATE,
  dataMetrics,
  dataRanges,
} from '../constants/dust';
import { API_URL, APP_TEST_TOKEN, IS_EXPO_GO } from '../config/runtime';
import { loadDashboardCache, saveDashboardCache } from '../features/dashboard/dashboardCache';
import { hasCompleteDashboardCache } from '../features/dashboard/dashboardCachePolicy';
import { fetchDashboardDust, fetchDashboardWeather } from '../features/dashboard/dashboardService';
import { loadStationCache, saveStationCache } from '../features/stations/stationCache';
import {
  loadCalendarNotificationIds,
  loadStoredAppState,
  saveCalendarEvents,
  saveCalendarNotificationIds,
  saveFavoriteRegions,
  saveGpsRegion,
  saveMapRecentSearches,
  saveNotificationSettings,
  saveOutfitSettings,
  saveNotificationToken,
  saveSelectedRegion,
} from '../storage/appStorage';
import { cancelCalendarEventNotifications, configureDustNotifications, requestDustPushToken, scheduleCalendarEventNotifications, scheduleTestNotification } from '../notifications/expoPush';
import { replaceCalendarNotifications } from '../notifications/calendarNotificationSync';
import type {
  BriefingMessage,
  CalendarEvent,
  CurrentDustItem,
  DataMetricKey,
  HourlyDustItem,
  NotificationSettings,
  OutfitSettings,
  PastDustItem,
  PredictionResponse,
  RegionState,
  StationDustItem,
  TabKey,
  WeatherDailyItem,
  WeatherState,
  WeatherHourlyItem,
  WeatherMidTermItem,
} from '../types/dust';
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
  normalizeSearchText,
  stationIdentity,
  toCompactDate,
  toIsoDate,
  toNumber,
  uniqueStations,
  wait,
} from '../utils/dust';
import { getWeatherVisualKind } from '../utils/weather';

const HOME_WEATHER_BACKGROUNDS = {
  clear: require('../../assets/weather-hero-banner.png'),
  cloudy: require('../../assets/weather-hero-cloudy.png'),
  rain: require('../../assets/weather-hero-rain.png'),
  snow: require('../../assets/weather-hero-snow.png'),
} as const;

function getHomeWeatherBackground(label?: string) {
  return HOME_WEATHER_BACKGROUNDS[getWeatherVisualKind(label)];
}

function WeatherBackdrop({ label, prominent = false }: { label?: string; prominent?: boolean }) {
  return (
    <View pointerEvents="none" style={styles.weatherScreenBackdrop}>
      <ImageBackground
        source={getHomeWeatherBackground(label)}
        style={styles.weatherScreenBackdropImage}
        imageStyle={[styles.weatherScreenBackdropImageStyle, prominent && styles.weatherScreenBackdropImageStrong]}
      />
    </View>
  );
}

function ScreenTransition({ children, transitionKey }: { children: ReactNode; transitionKey: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useLayoutEffect(() => {
    opacity.setValue(0);
    translateY.setValue(10);
    const transition = Animated.parallel([
      Animated.timing(opacity, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);
    transition.start();
    return () => transition.stop();
  }, [opacity, transitionKey, translateY]);

  return (
    <Animated.View style={[styles.screenTransition, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// 앱 전체의 탭 상태, API 데이터, 위치/즐겨찾기/알림 설정을 관리하는 최상위 컨테이너입니다.
export function AppContent() {
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
  const [mapMarkerMode, setMapMarkerMode] = useState<'dust' | 'weather'>('weather');
  const [mapRecentSearches, setMapRecentSearches] = useState<StationDustItem[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedStation, setSelectedStation] = useState<StationDustItem | null>(null);
  const [mapViewKey, setMapViewKey] = useState(0);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [yesterdayWeather, setYesterdayWeather] = useState<WeatherState | null>(null);
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
  const [outfitSettings, setOutfitSettings] = useState<OutfitSettings>(DEFAULT_OUTFIT_SETTINGS);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [serverPushToken, setServerPushToken] = useState<string | null>(null);
  const [isSavingNotificationSettings, setIsSavingNotificationSettings] = useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState(false);
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
  const calendarLocationForecasts = useCalendarLocationForecasts(calendarEvents, hasLoadedRegionStore, todayDateLabel);
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
  const calendarNotificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  // 비동기 응답이 도착했을 때 지금 선택된 지역과 같은지 비교하기 위한 최신 값입니다.
  const selectedRegionRef = useRef(selectedRegion);
  selectedRegionRef.current = selectedRegion;
  const weatherRequestRef = useRef(0);

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

  const loadWeather = async (lat: number, lng: number) => {
    // 늦게 도착한 이전 좌표의 응답이 최신 날씨를 덮어쓰지 않도록 마지막 요청만 반영합니다.
    const requestId = ++weatherRequestRef.current;
    try {
      const storedWeather = await loadStoredWeather(lat, lng, todayDateLabel);
      if (requestId !== weatherRequestRef.current) return;
      setWeather(storedWeather.weather);
      setYesterdayWeather(storedWeather.yesterdayWeather);
    } catch {
      if (requestId !== weatherRequestRef.current) return;
      setWeather(null);
      setYesterdayWeather(null);
    }
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
      const pastData = await getOptionalPastDust({
        region: activeDataRegion,
        startDate: toCompactDate(addDays(today, -days)),
        endDate: toCompactDate(latestDailyDate),
      });
      const nextItems = (pastData?.items as PastDustItem[] | undefined) ?? [];
      setDataItems(nextItems);
      if (nextItems.length === 0) setError('선택한 지역의 상세 데이터를 아직 불러오지 못했습니다.');
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
      setCurrentNotice(cachedDashboard.currentNotice);
      setWeather(cachedDashboard.weather ?? null);
      setIsLoading(false);
      finishRegionTransition();
      if (!force && hasCompleteDashboardCache(cachedDashboard)) return;
    } else {
      setIsLoading(true);
    }
    setError('');
    const weatherPromise = fetchDashboardWeather(region, todayDateLabel, stationItems).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ error, ok: false as const }),
    );
    try {
      const {
        currentItem: currentDustItem,
        currentNotice: nextCurrentNotice,
        hourlyItems: nextHourlyItems,
        pastItems: nextPastItems,
        prediction: predictionData,
      } = await fetchDashboardDust(region, todayDateLabel, cachedDashboard);
      if (isStale()) return;

      setPrediction(predictionData);
      setPastItems(nextPastItems);
      setHourlyItems(nextHourlyItems);
      setCurrentItem(currentDustItem);
      setCurrentNotice(nextCurrentNotice);
      setIsLoading(false);
      finishRegionTransition();
      try {
        const weatherResult = await weatherPromise;
        if (!weatherResult.ok) throw weatherResult.error;
        const storedWeather = weatherResult.value;
        if (isStale()) return;
        const nextWeatherHourlyItems = storedWeather.hourlyItems;
        const nextWeatherMidTermItems = storedWeather.midTermItems;
        const currentWeatherData = storedWeather.weather;
        const yesterdayWeatherData = storedWeather.yesterdayWeather;
        if (storedWeather.stations.length > 0 && stationItems.length === 0) setStationItems(storedWeather.stations);

        setWeatherHourlyItems(nextWeatherHourlyItems);
        setWeatherMidTermItems(nextWeatherMidTermItems);
        setWeather(currentWeatherData);
        setYesterdayWeather(yesterdayWeatherData);
        void saveDashboardCache(region, {
          currentItem: currentDustItem,
          currentNotice: nextCurrentNotice,
          hourlyItems: nextHourlyItems,
          pastItems: nextPastItems,
          prediction: predictionData,
          weather: currentWeatherData,
          weatherHourlyItems: nextWeatherHourlyItems,
          weatherMidTermItems: nextWeatherMidTermItems,
        });
      } catch (weatherError) {
        console.warn('대시보드 날씨 데이터를 불러오지 못했습니다.', weatherError);
        // Weather is secondary for first paint; keep the dust dashboard visible.
        void saveDashboardCache(region, {
          currentItem: currentDustItem,
          currentNotice: nextCurrentNotice,
          hourlyItems: nextHourlyItems,
          pastItems: nextPastItems,
          prediction: predictionData,
          weather: cachedDashboard?.weather ?? null,
          weatherHourlyItems: cachedDashboard?.weatherHourlyItems ?? [],
          weatherMidTermItems: cachedDashboard?.weatherMidTermItems ?? [],
        });
      }
    } catch (caught) {
      if (!cachedDashboard && !isStale()) {
        // 응답이 왔지만 실패한 경우와 서버에 닿지 못한 경우를 구분해 안내합니다.
        setError(caught instanceof ApiHttpError ? '데이터를 불러오지 못했어요.' : '서버에 연결할 수 없어요.');
      }
    } finally {
      // 이전 지역 요청이 새 지역의 로딩 표시를 먼저 끄지 않도록 합니다.
      if (!isStale()) {
        setIsLoading(false);
        finishRegionTransition();
      }
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

  // 지도 검색 결과를 선택했을 때 WebView 지도를 해당 측정소로 이동합니다.
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
    ? buildMobileMapUrl({ lat: homeMapPreviewCoords.lat, lng: homeMapPreviewCoords.lng, mode: 'weather', zoom: 11, view: 'preview' })
    : buildMobileMapUrl({ mode: 'weather', view: 'preview' });
  const fullMapUrlRef = useRef<string | null>(null);  
  if (activeTab === 'map' && !fullMapUrlRef.current) {
      fullMapUrlRef.current = homeMapPreviewCoords
        ? buildMobileMapUrl({ lat: homeMapPreviewCoords.lat, lng: homeMapPreviewCoords.lng, mode: mapMarkerMode, zoom: 11, view: 'full' })
        : buildMobileMapUrl({ mode: mapMarkerMode, view: 'full' });
    } else if (activeTab !== 'map') {
      fullMapUrlRef.current = null;
    }
    const fullMapUrl = fullMapUrlRef.current ?? buildMobileMapUrl({ mode: mapMarkerMode, view: 'full' });
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
    if (!DETAIL_DATA_ENABLED) {
      setMapSearchMessage('상세 데이터 화면은 현재 숨겨져 있습니다.');
      return;
    }
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
    if (!DETAIL_DATA_ENABLED || !selectedRegion) return;
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

  // 반복 일정의 "이후 일정 모두" 삭제: 이 날짜와 그 뒤의 같은 반복 일정만 지웁니다.
  const removeFollowingCalendarEvents = (target: CalendarEvent) => {
    setCalendarEvents((current) => withoutFollowingOccurrences(current, target));
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
      setNotificationMessage('Expo Go에서는 알림을 사용할 수 없어요. 개발 빌드에서 확인해 주세요.');
      return;
    }
    const nextSettings = { ...notificationSettings, [key]: value } as NotificationSettings;
    setIsSavingNotificationSettings(true);
    setNotificationMessage('');
    setNotificationSettings(nextSettings);
    if (key === 'calendarReminders') {
      setNotificationMessage(value ? '일정 알림을 켰어요.' : '일정 알림을 껐어요.');
    } else if (key === 'weatherMorningAlerts') {
      setNotificationMessage(value ? '아침 날씨 알림을 켰어요.' : '아침 날씨 알림을 껐어요.');
    } else {
      setNotificationMessage(value ? '알림을 켰어요.' : '알림을 껐어요.');
    }
    setIsSavingNotificationSettings(false);
  };

  const sendTestNotification = async () => {
    if (IS_EXPO_GO) {
      setNotificationMessage('테스트 알림은 개발 빌드에서 확인할 수 있어요.');
      return;
    }
    setIsSendingTestNotification(true);
    try {
      const scheduled = await scheduleTestNotification();
      setNotificationMessage(scheduled
        ? '3초 뒤 알림이 도착해요.'
        : '알림 권한을 허용하고 다시 시도해 주세요.');
    } catch {
      setNotificationMessage('알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  const updateOutfitSetting = <K extends keyof OutfitSettings>(key: K, value: OutfitSettings[K]) => {
    setOutfitSettings((current) => ({ ...current, [key]: value }));
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
    const willOpen = !showFavoritePicker;
    setShowFavoritePicker(willOpen);
    setShowHomeRegionSearch(false);
    if (willOpen) {
      requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ animated: true, y: 0 }));
    }
  };

  // 홈에서 지역 검색 패널을 열고, 필요하면 측정소 목록을 먼저 불러옵니다.
  const openHomeRegionSearch = () => {
    const willOpen = !showHomeRegionSearch;
    setShowHomeRegionSearch(willOpen);
    setShowFavoritePicker(false);
    if (willOpen) {
      requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ animated: true, y: 0 }));
    }
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
        setLocationMessage('위치 권한이 없어 기본 지역 기준으로 표시합니다.');
        return;
      }

      setLocationMessage('현재 위치를 가져오는 중입니다.');
      const hasLocationService = await Location.hasServicesEnabledAsync();
      if (!hasLocationService) {
        setLocationMessage('위치 서비스가 꺼져 있어 기본 지역 기준으로 표시합니다.');
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
        if (!canUseStoredRegion && !nextGpsRegion) setSelectedRegion(DEFAULT_REGION_STATE);
        setFavoriteRegions(nextFavorites);
        setMapRecentSearches(storedState.mapRecentSearches);
        setNotificationSettings(storedState.notificationSettings);
        setOutfitSettings(storedState.outfitSettings);
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
        sensitiveMode: outfitSettings.sensitiveMode,
        todayDateLabel,
        weather,
        weatherHourlyItems,
        weatherMidTermItems,
      });
      await replaceCalendarNotifications(notificationIds, calendarEvents, {
        cancel: cancelCalendarEventNotifications,
        isCurrent: () => !cancelled && calendarNotificationSyncRef.current === syncVersion,
        save: saveCalendarNotificationIds,
        schedule: (event) => scheduleCalendarEventNotifications(event, riskByEvent[event.id]),
      });
    };

    calendarNotificationQueueRef.current = calendarNotificationQueueRef.current
      .then(syncCalendarNotifications)
      .catch((error) => console.warn('일정 알림을 다시 예약하지 못했습니다.', error));
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
    outfitSettings.sensitiveMode,
    prediction,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  ]);

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
    loadStoredWeather(coords.lat, coords.lng, todayDateLabel)
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

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    saveFavoriteRegions(favoriteRegions);
  }, [favoriteRegions, hasLoadedRegionStore]);

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

      // 일정 요약은 서버의 아침 날씨 알림에만 쓰이므로, 그 알림이 꺼져 있으면 보내지 않습니다.
      const calendarEventSummary = notificationSettings.weatherMorningAlerts
        ? calendarEvents
          .filter((event) => event.date >= todayDateLabel)
          .slice(0, 30)
          // 일정 제목은 민감한 내용이 담기기 쉬워 서버로 보내지 않습니다. 아침 알림은 시간만 안내합니다.
          .map((event) => ({ date: event.date, time: event.time }))
        : [];

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

  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    saveOutfitSettings(outfitSettings);
  }, [hasLoadedRegionStore, outfitSettings]);

  // 현재 탭과 선택 지역에 맞는 데이터를 불러옵니다.
  useEffect(() => {
    if (!hasLoadedRegionStore || hasTriedInitialLocation) return;
    setHasTriedInitialLocation(true);
    applyNearestGpsRegion();
  }, [hasLoadedRegionStore, hasTriedInitialLocation]);

  // 서버는 예보를 매시 새로 모으므로, 홈에 머무는 동안 10분마다, 그리고 앱으로 돌아올 때마다 홈 예보를 다시 받습니다.
  const loadDashboardRef = useRef(loadDashboard);
  loadDashboardRef.current = loadDashboard;
  useEffect(() => {
    if (activeTab !== 'home') return;
    const refresh = () => {
      void loadDashboardRef.current(true);
    };
    const timer = setInterval(refresh, 10 * 60 * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [activeTab]);

  // 지도 탭 진입 시 GPS 기준 측정소로 초기 포커스를 한 번만 보냅니다.
  useEffect(() => {
    if (!selectedRegion) return;
    if (activeTab === 'home') loadDashboard();
    if (activeTab === 'map' && stationItems.length === 0) loadStations();
    if (DETAIL_DATA_ENABLED && detailRegion) {
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

  const tabBar = (
    <AppTabBar
      activeTab={activeTab}
      accentBorderTone={accentBorderTone}
      accentSoftTone={accentSoftTone}
      accentTone={accentTone}
      onNavigate={switchTab}
    />
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

  if (DETAIL_DATA_ENABLED && detailRegion) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <WeatherBackdrop label={weather?.label} />
        <ScreenTransition transitionKey={`detail-${resolvedDataRegion.city}-${resolvedDataRegion.region}-${dataDetailMode}`}>
        <ScrollView
          ref={mainScrollRef}
          style={styles.screenTransitionScroll}
          contentContainerStyle={[styles.screen, styles.detailScreen]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl colors={[accentTone]} refreshing={isLoadingPast} tintColor={accentTone} onRefresh={() => dataDetailMode === 'weather' ? loadWeatherDetail() : loadPastData(dataRangeDays)} />}
        >
          <View style={styles.detailScreenHeader}>
            <Pressable onPress={resetDataTab} style={({ pressed }) => [styles.detailBackButton, pressed && styles.pressedFeedback]}>
              <Ionicons name="chevron-back" size={22} color="#141821" />
            </Pressable>
            <View style={styles.detailHeaderTextGroup}>
              <Text style={styles.detailHeaderTitle}>{resolvedDataRegion.city} {resolvedDataRegion.region}</Text>
              <Text style={styles.detailHeaderSubText}>상세 데이터</Text>
            </View>
          </View>
          <View style={styles.detailModeCard}>
            <View style={styles.detailModeRow}>
              {[
                { key: 'dust' as const, label: '미세먼지' },
                { key: 'weather' as const, label: '날씨' },
              ].map((mode) => (
                <Pressable
                  key={mode.key}
                  onPress={() => setDataDetailMode(mode.key)}
                  style={({ pressed }) => [styles.detailModeButton, dataDetailMode === mode.key && { backgroundColor: accentTone }, pressed && styles.pressedFeedback]}
                >
                  <Text style={[styles.detailModeText, dataDetailMode === mode.key && styles.detailModeTextActive]}>{mode.label}</Text>
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
        </ScreenTransition>
        {bottomToast}
      </SafeAreaView>
    );
  }

  if (activeTab === 'map') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <WeatherBackdrop label={weather?.label} />
        <ScreenTransition transitionKey="map">
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
          onRetryMap={() => setMapViewKey((key) => key + 1)}
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
        </ScreenTransition>
        {tabBar}
      </SafeAreaView>
    );
  }

  if (activeTab === 'calendar') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        <ScreenTransition transitionKey="calendar">
        <View style={[styles.screen, styles.calendarOnlyScreen]}>
          <View style={styles.tabPageContent}>
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
              onRemoveFollowingEvents={removeFollowingCalendarEvents}
              onUpdateEvent={updateCalendarEvent}
              onUpdateEventSeries={updateCalendarEventSeries}
              outfitEnabled={outfitSettings.enabled}
              outfitFigure={outfitSettings.figure}
              sensitiveMode={outfitSettings.sensitiveMode}
              outfitSensitivity={outfitSettings.sensitivity}
              prediction={prediction}
              todayDateLabel={todayDateLabel}
              weather={weather}
              weatherHourlyItems={weatherHourlyItems}
              weatherMidTermItems={weatherMidTermItems}
            />
          </View>
        </View>
        </ScreenTransition>
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
      {activeTab !== 'home' && activeTab !== 'account' && <WeatherBackdrop label={weather?.label} />}
      <ScreenTransition transitionKey={activeTab}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.screenTransitionScroll}
        contentContainerStyle={[styles.screen, (activeTab === 'home' || activeTab === 'account') && styles.edgeToEdgeScreen]}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={activeTab === 'home' ? [0] : undefined}
        refreshControl={<RefreshControl colors={[accentTone]} refreshing={isRefreshingCurrent} tintColor={accentTone} onRefresh={loadCurrentDust} />}
      >
        {activeTab === 'home' ? (
          <View style={styles.homeHeader}>
            <View style={styles.homeTitleRow}>
              <Pressable
                accessibilityLabel={favoriteRegions.length === 0 ? '지역 검색 열기' : '즐겨찾기 지역 선택'}
                onPress={favoriteRegions.length === 0 ? openHomeRegionSearch : toggleFavoritePicker}
                style={({ pressed }) => [styles.homeTitleButton, pressed && styles.pressedFeedback]}
              >
                <View style={styles.homeTitleInline}>
                  <Text numberOfLines={1} style={[styles.title, styles.homeRegionTitle]}>{activeCity} {activeRegion}</Text>
                  <Ionicons color="#141821" name="chevron-down" size={20} style={styles.homeTitleChevron} />
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel="홈에서 지역 검색"
                onPress={openHomeRegionSearch}
                style={({ pressed }) => [styles.regionAddButton, pressed && styles.pressedFeedback]}
              >
                <AppActionIcon name="search" size={22} />
                <Text style={[styles.regionAddText, showHomeRegionSearch && { color: accentTone }]}>지역 검색</Text>
              </Pressable>
              {/* 기온을 아직 모르면 "--° 날씨" 같은 빈 칩 대신 아예 숨깁니다. */}
              {typeof weather?.temperature === 'number' && (
                <View
                  accessibilityLabel={`현재 ${Math.round(weather.temperature)}도${weather.label ? `, ${weather.label}` : ''}`}
                  accessible
                  style={styles.homeWeatherChip}
                >
                  <WeatherIcon kind={weatherIconKind(weather.label, weather.windSpeed)} size={24} />
                  <View>
                    <Text style={styles.homeWeatherValue}>{Math.round(weather.temperature)}°</Text>
                    {!!weather.label && <Text style={styles.homeWeatherLabel}>{weather.label}</Text>}
                  </View>
                </View>
              )}
            </View>
            {error && !currentItem ? (
              <Pressable
                accessibilityLabel={`${error} 다시 시도`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void loadDashboard(true)}
                style={({ pressed }) => [styles.homeErrorRow, pressed && styles.pressedFeedback]}
              >
                <Ionicons color={bauhausColors.red} name="cloud-offline-outline" size={14} />
                <Text style={styles.homeErrorText}>{error}</Text>
                <Text style={[styles.homeErrorRetry, { color: accentTone }]}>다시 시도</Text>
              </Pressable>
            ) : (
              <Text style={[styles.homeBasisText, currentItem?.source === 'stored_daily_latest' && styles.homeBasisTextFallback]}>
                {formatCurrentBasis(currentItem)}
              </Text>
            )}
          </View>
        ) : activeTab === 'account' ? (
          <View style={styles.tabPageHeader}>
            <View>
              <Text style={styles.tabPageTitle}>설정</Text>
            </View>
            <Ionicons color="#2563eb" name="options-outline" size={24} />
          </View>
        ) : (
          <Text style={styles.title}>{getTabRoute(activeTab)?.label}</Text>
        )}
        {activeTab === 'home' && showFavoritePicker && (
          <Animated.View style={[styles.favoritePicker, { opacity: homePanelOpacity, transform: [{ translateY: homePanelTranslateY }] }]}>
            <Text style={styles.favoritePickerTitle}>즐겨찾기 지역 선택</Text>
            {gpsRegion && !isSameRegion(gpsRegion, selectedRegion) && (
              <Pressable
                accessibilityRole="button"
                onPress={() => applyRegion(gpsRegion, `${gpsRegion.city} ${gpsRegion.region} 기준으로 돌아왔습니다.`)}
                style={({ pressed }) => [styles.favoritePickerRow, pressed && styles.pressedFeedback]}
              >
                <Ionicons color={bauhausColors.red} name="navigate" size={17} style={styles.favoritePickerIcon} />
                <View style={styles.homeRegionSuggestionTextGroup}>
                  <Text style={styles.favoritePickerText}>{gpsRegion.region}</Text>
                  <Text style={styles.homeRegionSuggestionMeta}>{gpsRegion.city} · 현재 위치</Text>
                </View>
                <Ionicons color="#B7C0CC" name="chevron-forward" size={18} />
              </Pressable>
            )}
            {favoriteRegions.length === 0 && (
              <Text style={styles.homeRegionSearchEmpty}>지역 검색 결과의 별을 눌러 즐겨찾기를 추가해 보세요.</Text>
            )}
            {favoriteRegions.map((region) => {
              const selected = isSameRegion(region, selectedRegion);
              return (
                <View key={`${region.city}-${region.region}`} style={styles.favoritePickerRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => applyRegion(region, `${region.city} ${region.region} 기준으로 변경했습니다.`)}
                    style={({ pressed }) => [styles.favoritePickerSelectArea, pressed && styles.pressedFeedback]}
                  >
                    <Ionicons color="#E2B93B" name="star" size={17} style={styles.favoritePickerIcon} />
                    <View style={styles.homeRegionSuggestionTextGroup}>
                      <Text style={[styles.favoritePickerText, selected && { color: accentTone }]}>{region.region}</Text>
                      <Text style={styles.homeRegionSuggestionMeta}>{region.city}</Text>
                    </View>
                    {selected && <Ionicons color={accentTone} name="checkmark" size={20} />}
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`${region.city} ${region.region} 즐겨찾기 삭제`}
                    hitSlop={8}
                    onPress={() => removeFavoriteRegion(region)}
                    style={({ pressed }) => [styles.favoritePickerRemoveButton, pressed && styles.pressedFeedback]}
                  >
                    <Ionicons color="#B7C0CC" name="close" size={17} />
                  </Pressable>
                </View>
              );
            })}
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
                  <Ionicons color={isSameRegion(gpsRegion, selectedRegion) ? textColors.disabled : accentTone} name="locate" size={20} />
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
                        <Ionicons color={alreadyFavorite ? '#E2B93B' : textColors.disabled} name={alreadyFavorite ? 'star' : 'star-outline'} size={22} />
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
            onDeleteCalendarEvent={removeCalendarEvent}
            onDeleteFollowingCalendarEvents={removeFollowingCalendarEvents}
            onOpenCalendar={() => setActiveTab('calendar')}
            onOpenDetail={openSelectedRegionDetail}
            onOpenMap={() => {
              if (stationItems.length === 0) loadStations();
              setMapViewKey((key) => key + 1);
              setActiveTab('map');
            }}
            outfitEnabled={outfitSettings.enabled}
            outfitFallbackLocation={selectedRegion}
            outfitFigure={outfitSettings.figure}
            outfitSensitivity={outfitSettings.sensitivity}
            sensitiveMode={outfitSettings.sensitiveMode}
            mapPreviewUrl={homeMapPreviewUrl}
            hourlyItems={hourlyItems}
            weatherHourlyItems={weatherHourlyItems}
            weatherMidTermItems={weatherMidTermItems}
            prediction={prediction}
            todayDateLabel={todayDateLabel}
            weather={weather}
            yesterdayWeather={yesterdayWeather}
            pastItems={pastItems}
            loadFailed={!!error && !currentItem}
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
            isSendingTestNotification={isSendingTestNotification}
            locationMessage={locationMessage}
            notificationsUnavailable={IS_EXPO_GO}
            notificationSettings={notificationSettings}
            outfitSettings={outfitSettings}
            onRemoveFavorite={removeFavoriteRegion}
            onSendTestNotification={sendTestNotification}
            onToggleNotificationSetting={updateNotificationSetting}
            onUpdateOutfitSetting={updateOutfitSetting}
            onUseCurrentLocation={applyNearestGpsRegion}
            selectedRegion={selectedRegion}
          />
        )}
      </ScrollView>
      </ScreenTransition>
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
