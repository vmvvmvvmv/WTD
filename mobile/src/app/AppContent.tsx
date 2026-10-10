import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { CalendarPanel } from '../components/calendar/CalendarPanel';
import { HomePanel } from '../components/home/HomePanel';
import { FullMapScreen } from '../components/map/FullMapScreen';
import { findStationSuggestions, useMapSearch } from '../components/map/useMapSearch';
import { RegionPanel } from '../components/settings/RegionPanel';
import { AppActionIcon } from '../components/shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../components/shared/WeatherIcon';
import { API_URL, APP_TEST_TOKEN, IS_EXPO_GO } from '../config/runtime';
import { DEFAULT_OUTFIT_SETTINGS } from '../constants/dust';
import { useCalendarEvents } from '../features/calendar/useCalendarEvents';
import { useCalendarLocationForecasts } from '../features/calendar/useCalendarLocationForecasts';
import { useCalendarReminderSync } from '../features/calendar/useCalendarReminderSync';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import { useRegions } from '../features/region/useRegions';
import { useStations } from '../features/stations/useStations';
import { weatherStateFromStation } from '../features/weather/weatherData';
import { AppTabBar } from '../navigation/AppTabBar';
import { useNotificationSettings } from '../notifications/useNotificationSettings';
import { loadStoredAppState, saveOutfitSettings } from '../storage/appStorage';
import { styles } from '../styles/appStyles';
import { buildOutingAccentTheme } from '../theme/appTheme';
import { bauhausColors, textColors } from '../theme/bauhaus';
import type { OutfitSettings, RegionState, StationDustItem, TabKey } from '../types/dust';
import { formatCurrentBasis, isSameRegion, normalizeLatLng, stationIdentity, toNumber } from '../utils/dust';
import { useTodayLabel } from '../utils/useTodayLabel';
import { getWeatherVisualKind } from '../utils/weather';

const HOME_WEATHER_BACKGROUNDS = {
  clear: require('../../assets/weather-hero-banner.png'),
  cloudy: require('../../assets/weather-hero-cloudy.png'),
  rain: require('../../assets/weather-hero-rain.png'),
  snow: require('../../assets/weather-hero-snow.png'),
} as const;

function WeatherBackdrop({ label }: { label?: string }) {
  return (
    <View pointerEvents="none" style={styles.weatherScreenBackdrop}>
      <ImageBackground
        source={HOME_WEATHER_BACKGROUNDS[getWeatherVisualKind(label)]}
        style={styles.weatherScreenBackdropImage}
        imageStyle={styles.weatherScreenBackdropImageStyle}
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

// 탭 이동, 화면 사이 연결(지역 전환·검색 패널·토스트), 저장된 설정 복원을 맡는 최상위 화면입니다.
// 데이터와 상태는 기능별 훅이 관리합니다: 지역(useRegions), 측정소(useStations), 홈 데이터(useDashboardData),
// 일정(useCalendarEvents), 알림(useNotificationSettings), 지도 검색(useMapSearch).
export function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [showHomeRegionSearch, setShowHomeRegionSearch] = useState(false);
  const [homeRegionSearchText, setHomeRegionSearchText] = useState('');
  const [outfitSettings, setOutfitSettings] = useState<OutfitSettings>(DEFAULT_OUTFIT_SETTINGS);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [isRegionTransitioning, setIsRegionTransitioning] = useState(false);
  const [hasLoadedRegionStore, setHasLoadedRegionStore] = useState(false);
  const [hasTriedInitialLocation, setHasTriedInitialLocation] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const todayDateLabel = useTodayLabel();

  const {
    events: calendarEvents,
    setEvents: setCalendarEvents,
    addEvent: addCalendarEvent,
    addEvents: addCalendarEvents,
    removeEvent: removeCalendarEvent,
    removeFollowingEvents: removeFollowingCalendarEvents,
    updateEvent: updateCalendarEvent,
    updateEventSeries: updateCalendarEventSeries,
  } = useCalendarEvents(hasLoadedRegionStore);
  const { ensureMapStations, isLoadingStations, loadStations, mapStations, setStationItems, stationItems } = useStations();
  const {
    favoriteRegions,
    gpsRegion,
    hydrate: hydrateRegions,
    isLocating,
    locateNearestRegion,
    locationMessage,
    removeFavorite: removeFavoriteRegion,
    selectedRegion,
    setLocationMessage,
    setSelectedRegion,
    toggleFavorite: toggleFavoriteRegion,
  } = useRegions(hasLoadedRegionStore, setNotificationMessage);
  const {
    clear: clearDashboard,
    currentItem,
    error,
    hourlyItems,
    isRefreshingCurrent,
    loadCurrentDust,
    loadDashboard,
    loadWeather,
    pastItems,
    prediction,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
    yesterdayWeather,
  } = useDashboardData({
    autoRefresh: activeTab === 'home',
    onSettled: () => finishRegionTransition(),
    selectedRegion,
    setStationItems,
    stationItems,
    todayDateLabel,
  });

  // 현재 선택 지역과 불러온 데이터에서 UI 색상과 표시값을 계산합니다.
  const latestPastItem = pastItems[pastItems.length - 1];
  const activeCity = selectedRegion?.city ?? '';
  const activeRegion = selectedRegion?.region ?? '';
  const currentPm10 = toNumber(currentItem?.pm10Value) ?? toNumber(latestPastItem?.pm10Value);
  const currentPm25 = toNumber(currentItem?.pm25Value) ?? toNumber(latestPastItem?.pm25Value);
  const currentO3 = toNumber(currentItem?.o3Value) ?? toNumber(latestPastItem?.o3Value);
  const accentTheme = buildOutingAccentTheme({ pm10: currentPm10, weather });
  const accentTone = accentTheme.tone;
  const accentSoftTone = accentTheme.softTone;
  const accentBorderTone = accentTheme.borderTone;
  const calendarLocationForecasts = useCalendarLocationForecasts(calendarEvents, hasLoadedRegionStore, todayDateLabel);
  const {
    settings: notificationSettings,
    hydrate: hydrateNotificationSettings,
    isSaving: isSavingNotificationSettings,
    isTesting: isSendingTestNotification,
    updateSetting: updateNotificationSetting,
    sendTest: sendTestNotification,
  } = useNotificationSettings(hasLoadedRegionStore, selectedRegion, calendarEvents, todayDateLabel, setNotificationMessage);
  useCalendarReminderSync(calendarEvents, hasLoadedRegionStore, notificationSettings.enabled && notificationSettings.calendarReminders, {
    currentPm10,
    eventLocationForecasts: calendarLocationForecasts,
    hourlyItems,
    prediction,
    sensitiveMode: outfitSettings.sensitiveMode,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  });
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

  // 스크롤 제어와 탭 이동 감지를 위한 ref입니다.
  const mainScrollRef = useRef<ScrollView>(null);
  const previousTabRef = useRef<TabKey>(activeTab);

  // 지역 전환, 검색 패널, 토스트 표시 애니메이션 값입니다.
  const regionTransitionOpacity = useRef(new Animated.Value(0)).current;
  const regionTransitionScale = useRef(new Animated.Value(0.98)).current;
  const homePanelOpacity = useRef(new Animated.Value(0)).current;
  const homePanelTranslateY = useRef(new Animated.Value(-8)).current;
  const notificationToastOpacity = useRef(new Animated.Value(0)).current;
  const notificationToastTranslateY = useRef(new Animated.Value(16)).current;

  const {
    closeMapSearch, dismissMapSearchKeyboard, findStationForRegion, focusGpsMapRegion, focusMapStation,
    isMapSearchFocused, mapMarkerMode, mapRecentSearches, mapSearchInputRef, mapSearchMessage,
    mapSearchOverlayInputRef, mapSearchOverlayOpacity, mapSearchOverlayTranslateY, mapSearchText,
    mapViewKey, mapWebViewRef, removeMapRecentSearch, searchSuggestions, selectedStation,
    selectedStationWeather, setIsMapSearchFocused, setMapRecentSearches, setMapSearchMessage,
    setMapSearchText, setMapViewKey, setSelectedStation, setSelectedStationWeather,
    setShowSearchSuggestions, showSearchSuggestions, switchMapMarkerMode,
  } = useMapSearch(mapStations, gpsRegion, hasLoadedRegionStore, activeTab === 'map', todayDateLabel);

  // 홈 화면 지역 검색어에 맞는 측정소 후보를 계산합니다.
  const homeRegionSuggestions = useMemo(() => {
    return findStationSuggestions(mapStations, homeRegionSearchText, 6);
  }, [homeRegionSearchText, mapStations]);

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

  const calendarMapPickerStation = findStationForRegion(gpsRegion) ?? findStationForRegion(selectedRegion);
  const calendarMapPickerCoords = normalizeLatLng(calendarMapPickerStation?.lat, calendarMapPickerStation?.lng);
  const homeMapPreviewStation = findStationForRegion(gpsRegion) ?? findStationForRegion(selectedRegion);
  const homeMapPreviewCoords = normalizeLatLng(homeMapPreviewStation?.lat, homeMapPreviewStation?.lng);
  const homeMapPreviewUrl = homeMapPreviewCoords
    ? buildMobileMapUrl({ lat: homeMapPreviewCoords.lat, lng: homeMapPreviewCoords.lng, mode: 'weather', zoom: 11, view: 'preview' })
    : buildMobileMapUrl({ mode: 'weather', view: 'preview' });
  // 지도 탭에 들어온 순간의 주소를 고정해, 머무는 동안 WebView가 다시 로드되지 않게 합니다.
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

  // WebView 안의 네이버 지도에서 보낸 마커 선택 이벤트를 처리합니다.
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
    } catch {
      // Ignore non-JSON messages from the WebView.
    }
  };

  const updateOutfitSetting = <K extends keyof OutfitSettings>(key: K, value: OutfitSettings[K]) => {
    setOutfitSettings((current) => ({ ...current, [key]: value }));
  };

  const closeHomeRegionPanels = () => {
    setShowFavoritePicker(false);
    setShowHomeRegionSearch(false);
    setHomeRegionSearchText('');
  };

  // 홈 기준 지역을 바꾸고 관련 화면 데이터를 새로 불러올 준비를 합니다.
  const applyRegion = (region: RegionState, message?: string) => {
    closeHomeRegionPanels();
    if (message) setLocationMessage(message);
    setActiveTab('home');
    if (selectedRegion && isSameRegion(region, selectedRegion)) {
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
    clearDashboard();
  };

  // 현재 GPS 좌표와 가장 가까운 측정소를 찾아 앱의 기준 지역으로 설정합니다.
  const applyNearestGpsRegion = async () => {
    const region = await locateNearestRegion({
      ensureMapStations,
      onCoords: (coords) => loadWeather(coords.lat, coords.lng),
    });
    if (region) applyRegion(region, `${region.city} ${region.region} 기준으로 설정했습니다.`);
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

  const regionFromStation = (station: StationDustItem): RegionState | null => {
    const city = station.sido;
    const region = station.city || station.name;
    return city && region ? { city, region, label: station.name } : null;
  };

  // 홈 지역 검색 결과를 눌렀을 때 홈 기준 지역으로 적용합니다.
  const selectHomeRegionSuggestion = (station: StationDustItem) => {
    const region = regionFromStation(station);
    if (region) applyRegion(region, `${region.city} ${region.region} 기준으로 변경했습니다.`);
  };

  // 지도·홈 검색 결과의 별표로 즐겨찾기를 추가하거나 해제합니다.
  const toggleStationFavorite = (station: StationDustItem) => {
    const region = regionFromStation(station);
    if (region) toggleFavoriteRegion(region);
  };

  // 저장해 둔 지역·설정·일정을 불러옵니다.
  useEffect(() => {
    let cancelled = false;
    loadStoredAppState()
      .then((storedState) => {
        if (cancelled) return;
        hydrateRegions(storedState);
        setMapRecentSearches(storedState.mapRecentSearches);
        hydrateNotificationSettings(storedState.notificationSettings, storedState.notificationToken);
        setOutfitSettings(storedState.outfitSettings);
        setCalendarEvents(storedState.calendarEvents);
        setHasLoadedRegionStore(true);
      })
      .catch(() => {
        if (!cancelled) setHasLoadedRegionStore(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasLoadedRegionStore) saveOutfitSettings(outfitSettings);
  }, [hasLoadedRegionStore, outfitSettings]);

  // 선택 지역의 측정소 좌표로 현재 날씨를 불러옵니다.
  useEffect(() => {
    if (!selectedRegion || mapStations.length === 0) return;
    const coords = normalizeLatLng(findStationForRegion(selectedRegion)?.lat, findStationForRegion(selectedRegion)?.lng);
    if (coords) loadWeather(coords.lat, coords.lng);
  }, [mapStations.length, selectedRegion]);

  // 저장값을 불러온 뒤 한 번, 현재 위치 기준 지역을 찾습니다.
  useEffect(() => {
    if (!hasLoadedRegionStore || hasTriedInitialLocation) return;
    setHasTriedInitialLocation(true);
    applyNearestGpsRegion();
  }, [hasLoadedRegionStore, hasTriedInitialLocation]);

  // 현재 탭과 선택 지역에 맞는 데이터를 불러옵니다.
  useEffect(() => {
    if (!selectedRegion) return;
    if (activeTab === 'home') loadDashboard();
    if (activeTab === 'map' && stationItems.length === 0) loadStations();
    if (activeTab === 'calendar' && (!currentItem || !prediction || pastItems.length === 0)) loadDashboard();
  }, [activeTab, selectedRegion]);

  // 탭을 떠날 때 그 탭의 임시 상태(지도 선택, 홈 검색 패널)를 정리합니다.
  useEffect(() => {
    const previousTab = previousTabRef.current;
    if (previousTab === 'map' && activeTab !== 'map') {
      setSelectedStation(null);
      setMapViewKey((key) => key + 1);
    }
    if (previousTab === 'home' && activeTab !== 'home') {
      Keyboard.dismiss();
      closeHomeRegionPanels();
    }
    previousTabRef.current = activeTab;
  }, [activeTab]);

  // 지도 탭을 5분 이상 보지 않으면 선택 마커와 검색 상태를 초기화합니다.
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

  // 홈의 즐겨찾기/지역 검색 패널 등장 애니메이션입니다.
  useEffect(() => {
    homePanelOpacity.setValue(0);
    homePanelTranslateY.setValue(-8);
    if (activeTab !== 'home' || (!showFavoritePicker && !showHomeRegionSearch)) return;
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

  // 키보드 높이를 추적해 하단 토스트가 키보드에 가려지지 않게 합니다.
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
  }, []);

  // 알림·즐겨찾기 결과 메시지를 하단 토스트로 잠깐 보여줍니다.
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

  // Android 뒤로가기: 지도 검색/선택 상태를 닫고, 아무것도 없으면 홈으로 갑니다.
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

  // Android 뒤로가기: 홈 검색/즐겨찾기 패널이 열려 있으면 패널만 닫습니다.
  useEffect(() => {
    if (activeTab !== 'home' || (!showHomeRegionSearch && !showFavoritePicker)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      if (showHomeRegionSearch) {
        setShowHomeRegionSearch(false);
        setHomeRegionSearchText('');
        return true;
      }
      setShowFavoritePicker(false);
      return true;
    });
    return () => subscription.remove();
  }, [activeTab, showFavoritePicker, showHomeRegionSearch]);

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
          onToggleFavorite={toggleStationFavorite}
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

  // 홈과 설정 탭
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.keyboardAvoidingRoot}
      >
      <ScreenTransition transitionKey={activeTab}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.screenTransitionScroll}
        contentContainerStyle={[styles.screen, styles.edgeToEdgeScreen]}
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
            {/* 즐겨찾기 지역 바꾸기: 머리 안에 있어서 화면을 내려도 머리와 함께 위에 붙어 있습니다. */}
            {showFavoritePicker && (
              <Animated.View style={[styles.favoritePicker, { opacity: homePanelOpacity, transform: [{ translateY: homePanelTranslateY }] }]}>
                <View style={styles.favoritePickerHeader}>
                  <Text style={styles.favoritePickerTitle}>지역 바꾸기</Text>
                  <Text style={styles.favoritePickerCount}>즐겨찾기 {favoriteRegions.length}곳</Text>
                </View>
                <ScrollView nestedScrollEnabled style={styles.favoritePickerScroll}>
                  {gpsRegion && (() => {
                    const selected = isSameRegion(gpsRegion, selectedRegion);
                    return (
                      <Pressable
                        accessibilityLabel={`현재 지역 ${gpsRegion.city} ${gpsRegion.region}${selected ? ', 보는 중' : ''}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={selected}
                        onPress={() => applyRegion(gpsRegion, `${gpsRegion.city} ${gpsRegion.region} 기준으로 돌아왔습니다.`)}
                        style={({ pressed }) => [styles.favoritePickerRow, pressed && styles.pressedFeedback]}
                      >
                        <View style={styles.favoritePickerIconBox}><AppActionIcon name="location" size={22} /></View>
                        <Text numberOfLines={1} style={styles.favoritePickerName}>
                          <Text style={selected && { color: accentTone }}>{gpsRegion.region}</Text>
                          <Text style={styles.favoritePickerCity}>{`  ${gpsRegion.city}`}</Text>
                        </Text>
                        {selected ? (
                          <Text style={[styles.favoritePickerStatus, { color: accentTone }]}>✓ 보는 중</Text>
                        ) : (
                          <Text style={styles.favoritePickerStatus}>현재 지역</Text>
                        )}
                      </Pressable>
                    );
                  })()}
                  {favoriteRegions.map((region) => {
                    const selected = isSameRegion(region, selectedRegion);
                    return (
                      <View key={`${region.city}-${region.region}`} style={styles.favoritePickerRow}>
                        <Pressable
                          accessibilityLabel={`${region.city} ${region.region}${selected ? ', 보는 중' : ''}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => applyRegion(region, `${region.city} ${region.region} 기준으로 변경했습니다.`)}
                          style={({ pressed }) => [styles.favoritePickerSelectArea, pressed && styles.pressedFeedback]}
                        >
                          <Ionicons color="#E2B93B" name="star" size={17} style={styles.favoritePickerIcon} />
                          <Text numberOfLines={1} style={styles.favoritePickerName}>
                            <Text style={selected && { color: accentTone }}>{region.region}</Text>
                            <Text style={styles.favoritePickerCity}>{`  ${region.city}`}</Text>
                          </Text>
                          {selected && <Text style={[styles.favoritePickerStatus, { color: accentTone }]}>✓ 보는 중</Text>}
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`${region.city} ${region.region} 즐겨찾기 삭제`}
                          hitSlop={8}
                          onPress={() => removeFavoriteRegion(region)}
                          style={({ pressed }) => [styles.favoritePickerRemoveButton, pressed && styles.pressedFeedback]}
                        >
                          <Ionicons color={textColors.disabled} name="close" size={17} />
                        </Pressable>
                      </View>
                    );
                  })}
                  {favoriteRegions.length === 0 && (
                    <Text style={styles.homeRegionSearchEmpty}>지역 검색 결과의 별을 눌러 즐겨찾기를 추가해 보세요.</Text>
                  )}
                </ScrollView>
              </Animated.View>
            )}
          </View>
        ) : (
          <View style={styles.tabPageHeader}>
            <View>
              <Text style={styles.tabPageTitle}>설정</Text>
            </View>
            <Ionicons color={bauhausColors.blue} name="options-outline" size={24} />
          </View>
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
                        onPress={() => toggleStationFavorite(station)}
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
