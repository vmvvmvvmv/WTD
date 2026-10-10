import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarPanel } from '../components/calendar/CalendarPanel';
import { HomeHeader } from '../components/home/HomeHeader';
import { HomePanel } from '../components/home/HomePanel';
import { HomeRegionSearchPanel } from '../components/home/HomeRegionSearchPanel';
import { RegionLoadingOverlay, useRegionTransition } from '../components/home/RegionLoadingOverlay';
import { FullMapScreen } from '../components/map/FullMapScreen';
import { findStationSuggestions, useMapSearch } from '../components/map/useMapSearch';
import { useMapTabLifecycle } from '../components/map/useMapTabLifecycle';
import { RegionPanel } from '../components/settings/RegionPanel';
import { BottomToast } from '../components/shared/BottomToast';
import { LocationGate } from '../components/shared/LocationGate';
import { ScreenTransition, WeatherBackdrop } from '../components/shared/ScreenChrome';
import { IS_EXPO_GO } from '../config/runtime';
import { DEFAULT_OUTFIT_SETTINGS } from '../constants/dust';
import { useCalendarEvents } from '../features/calendar/useCalendarEvents';
import { useCalendarLocationForecasts } from '../features/calendar/useCalendarLocationForecasts';
import { useCalendarReminderSync } from '../features/calendar/useCalendarReminderSync';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import { useRegions } from '../features/region/useRegions';
import { useStations } from '../features/stations/useStations';
import { AppTabBar } from '../navigation/AppTabBar';
import { useNotificationSettings } from '../notifications/useNotificationSettings';
import { loadStoredAppState, saveOutfitSettings } from '../storage/appStorage';
import { styles } from '../styles/appStyles';
import { buildOutingAccentTheme } from '../theme/appTheme';
import { bauhausColors } from '../theme/bauhaus';
import type { OutfitSettings, RegionState, StationDustItem, TabKey } from '../types/dust';
import { normalizeLatLng, toNumber, isSameRegion } from '../utils/dust';
import { buildMobileMapUrl } from '../utils/mobileMapUrl';
import { useTodayLabel } from '../utils/useTodayLabel';

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
  const [hasLoadedRegionStore, setHasLoadedRegionStore] = useState(false);
  const [hasTriedInitialLocation, setHasTriedInitialLocation] = useState(false);
  const todayDateLabel = useTodayLabel();
  const regionTransition = useRegionTransition();

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
    onSettled: () => regionTransition.finish(),
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
  // 스크롤 제어와 탭 이동 감지를 위한 ref입니다.
  const mainScrollRef = useRef<ScrollView>(null);
  const previousTabRef = useRef<TabKey>(activeTab);

  // 홈의 즐겨찾기/지역 검색 패널 등장 애니메이션 값입니다.
  const homePanelOpacity = useRef(new Animated.Value(0)).current;
  const homePanelTranslateY = useRef(new Animated.Value(-8)).current;
  const homePanelAnimation = { opacity: homePanelOpacity, translateY: homePanelTranslateY };

  const mapSearch = useMapSearch(mapStations, gpsRegion, hasLoadedRegionStore, activeTab === 'map', todayDateLabel);
  const { findStationForRegion, mapMarkerMode, setMapRecentSearches, setMapViewKey } = mapSearch;
  const { handleMapMessage } = useMapTabLifecycle(mapSearch, activeTab, () => switchTab('home'));

  // 홈 화면 지역 검색어에 맞는 측정소 후보를 계산합니다.
  const homeRegionSuggestions = useMemo(() => {
    return findStationSuggestions(mapStations, homeRegionSearchText, 6);
  }, [homeRegionSearchText, mapStations]);

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
        regionTransition.start();
        void loadDashboard();
      } else {
        regionTransition.finish();
      }
      return;
    }
    regionTransition.start();
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

  // 홈 탭을 떠날 때 검색·즐겨찾기 패널을 닫습니다(지도 탭 정리는 useMapTabLifecycle).
  useEffect(() => {
    if (previousTabRef.current === 'home' && activeTab !== 'home') {
      Keyboard.dismiss();
      closeHomeRegionPanels();
    }
    previousTabRef.current = activeTab;
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
    return <LocationGate isLocating={isLocating} message={locationMessage} onRetry={applyNearestGpsRegion} />;
  }

  const bottomToast = <BottomToast message={notificationMessage} />;

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
          dismissMapSearchKeyboard={mapSearch.dismissMapSearchKeyboard}
          favoriteRegions={favoriteRegions}
          focusGpsMapRegion={mapSearch.focusGpsMapRegion}
          focusMapStation={mapSearch.focusMapStation}
          handleMapMessage={handleMapMessage}
          isLoadingStations={isLoadingStations}
          isMapSearchFocused={mapSearch.isMapSearchFocused}
          mapMarkerMode={mapMarkerMode}
          mapRecentSearches={mapSearch.mapRecentSearches}
          mapSearchInputRef={mapSearch.mapSearchInputRef}
          mapSearchMessage={mapSearch.mapSearchMessage}
          mapSearchOverlayInputRef={mapSearch.mapSearchOverlayInputRef}
          mapSearchOverlayOpacity={mapSearch.mapSearchOverlayOpacity}
          mapSearchOverlayTranslateY={mapSearch.mapSearchOverlayTranslateY}
          mapSearchText={mapSearch.mapSearchText}
          mapUrl={fullMapUrl}
          mapViewKey={mapSearch.mapViewKey}
          mapWebViewRef={mapSearch.mapWebViewRef}
          onBackHome={() => switchTab('home')}
          onClearRecentSearches={() => setMapRecentSearches([])}
          onRemoveRecentSearch={mapSearch.removeMapRecentSearch}
          onRetryMap={() => setMapViewKey((key) => key + 1)}
          onToggleFavorite={toggleStationFavorite}
          searchSuggestions={mapSearch.searchSuggestions}
          selectedStation={mapSearch.selectedStation}
          selectedStationWeather={mapSearch.selectedStationWeather}
          setIsMapSearchFocused={mapSearch.setIsMapSearchFocused}
          setMapSearchMessage={mapSearch.setMapSearchMessage}
          setMapSearchText={mapSearch.setMapSearchText}
          setSelectedStation={mapSearch.setSelectedStation}
          setShowSearchSuggestions={mapSearch.setShowSearchSuggestions}
          showSearchSuggestions={mapSearch.showSearchSuggestions}
          switchMapMarkerMode={mapSearch.switchMapMarkerMode}
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
          <HomeHeader
            accentTone={accentTone}
            currentItem={currentItem}
            error={error}
            favoriteRegions={favoriteRegions}
            gpsRegion={gpsRegion}
            isSearchOpen={showHomeRegionSearch}
            onApplyRegion={applyRegion}
            onOpenSearch={openHomeRegionSearch}
            onRemoveFavorite={removeFavoriteRegion}
            onRetry={() => void loadDashboard(true)}
            onToggleFavoritePicker={toggleFavoritePicker}
            panelAnimation={homePanelAnimation}
            selectedRegion={selectedRegion}
            showFavoritePicker={showFavoritePicker}
            weather={weather}
          />
        ) : (
          <View style={styles.tabPageHeader}>
            <View>
              <Text style={styles.tabPageTitle}>설정</Text>
            </View>
            <Ionicons color={bauhausColors.blue} name="options-outline" size={24} />
          </View>
        )}
        {activeTab === 'home' && showHomeRegionSearch && (
          <HomeRegionSearchPanel
            accentTone={accentTone}
            favoriteRegions={favoriteRegions}
            gpsRegion={gpsRegion}
            isLoadingStations={isLoadingStations}
            onApplyRegion={applyRegion}
            onChangeText={setHomeRegionSearchText}
            onSelectStation={selectHomeRegionSuggestion}
            onToggleFavorite={toggleStationFavorite}
            panelAnimation={homePanelAnimation}
            searchText={homeRegionSearchText}
            selectedRegion={selectedRegion}
            suggestions={homeRegionSuggestions}
          />
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
      {regionTransition.isTransitioning && activeTab === 'home' && (
        <RegionLoadingOverlay accentTone={accentTone} opacity={regionTransition.opacity} scale={regionTransition.scale} title={`${activeCity} ${activeRegion}`} />
      )}
      {bottomToast}
      {tabBar}
    </SafeAreaView>
  );
}
