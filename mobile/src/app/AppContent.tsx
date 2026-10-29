import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Keyboard, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarPanel } from '../components/calendar/CalendarPanel';
import { HomeHeader } from '../components/home/HomeHeader';
import { HomePanel } from '../components/home/HomePanel';
import { HomeRegionSearchPanel } from '../components/home/HomeRegionSearchPanel';
import { useRegionTransition } from '../components/home/useRegionTransition';
import { FullMapScreen } from '../components/map/FullMapScreen';
import { useMapSearch } from '../components/map/useMapSearch';
import type { RegionSearchResult } from '../features/region/regionPlaceSearch';
import { useRegionPlaceSearch } from '../features/region/useRegionPlaceSearch';
import { useMapTabLifecycle } from '../components/map/useMapTabLifecycle';
import { RegionPanel } from '../components/settings/RegionPanel';
import { BottomToast } from '../components/shared/BottomToast';
import { LocationGate } from '../components/shared/LocationGate';
import { CalendarTip, TutorialTour, WelcomeSheet } from '../components/shared/TutorialTour';
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
import { bauhausColors } from '../theme/bauhaus';
import type { StationDustItem } from '../types/dust';
import type { TabKey } from '../types/navigation';
import type { OutfitSettings } from '../types/outfit';
import type { RegionState } from '../types/region';
import { isSameRegion } from '../features/region/regionUtils';
import { toNumber } from '../utils/format';
import { useTodayLabel } from '../utils/useTodayLabel';
import { useAppMapUrls } from './useAppMapUrls';
import { useAppNavigationEvents } from './useAppNavigationEvents';
import { useAppTutorial } from './useAppTutorial';
import { useToast } from './useToast';
import { accentTone } from '../theme/appTheme';

// 탭 이동, 화면 사이 연결(지역 전환·검색 패널·토스트), 저장된 설정 복원을 맡는 최상위 화면입니다.
// 데이터와 상태는 기능별 훅이 관리합니다: 지역(useRegions), 측정소(useStations), 홈 데이터(useDashboardData),
// 일정(useCalendarEvents), 알림(useNotificationSettings), 지도 검색(useMapSearch).

export function AppContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [tabBarTop, setTabBarTop] = useState<number>();
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);
  const [showHomeRegionSearch, setShowHomeRegionSearch] = useState(false);
  const [homeRegionSearchText, setHomeRegionSearchText] = useState('');
  const [outfitSettings, setOutfitSettings] = useState<OutfitSettings>(DEFAULT_OUTFIT_SETTINGS);
  const { showToast: setNotificationMessage, toast } = useToast();
  const [hasLoadedRegionStore, setHasLoadedRegionStore] = useState(false);
  const [hasTriedInitialLocation, setHasTriedInitialLocation] = useState(false);
  const {
    calendarTipSeen, continueTutorialInCalendar, dismissCalendarTip, finishTutorial,
    hydrate: hydrateTutorial, setTutorialMode, skipTutorialForNow, tutorialMode,
  } = useAppTutorial({ notify: setNotificationMessage, switchTab: (tab) => switchTab(tab) });
  useAppNavigationEvents(activeTab, setActiveTab, setNotificationMessage);

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
  } = useCalendarEvents(hasLoadedRegionStore, setNotificationMessage);
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
    pastItems,
    prediction,
    weather,
    weatherHourlyItems,
    weatherForecastResolved,
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
  const currentPm10 = toNumber(currentItem?.pm10Value) ?? toNumber(latestPastItem?.pm10Value);
  const currentPm25 = toNumber(currentItem?.pm25Value) ?? toNumber(latestPastItem?.pm25Value);
  const currentO3 = toNumber(currentItem?.o3Value) ?? toNumber(latestPastItem?.o3Value);
  const calendarLocationForecasts = useCalendarLocationForecasts(calendarEvents, hasLoadedRegionStore, todayDateLabel);
  const {
    settings: notificationSettings,
    hydrate: hydrateNotificationSettings,
    isSaving: isSavingNotificationSettings,
    updateSetting: updateNotificationSetting,
  } = useNotificationSettings(hasLoadedRegionStore, gpsRegion ?? selectedRegion, calendarEvents, todayDateLabel, setNotificationMessage);

  // 알림(특보·미세먼지·아침 날씨)은 현재 위치 기준이다. 시작할 때는 아래 첫 위치 찾기가 하고,
  // 백그라운드에 있다가 돌아오면 권한이 이미 있을 때만 조용히 갱신한다. 화면의 선택 지역은 바꾸지 않는다.
  // 10분 안에 알던 위치는 그대로 쓰고 같은 지역이면 다시 등록하지 않아서, 자주 돌아와도 비용이 거의 없다.
  useEffect(() => {
    if (!hasLoadedRegionStore) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void locateNearestRegion({ ensureMapStations, silent: true });
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoadedRegionStore]);
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
  const homeRegionSearch = useRegionPlaceSearch(homeRegionSearchText, mapStations);

  const { calendarDefaultLocation, calendarMapPickerUrl, fullMapUrl, homeMapPreviewUrl } = useAppMapUrls({
    activeTab, findStationForRegion, gpsRegion, mapMarkerMode, selectedRegion,
  });

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
  // GPS 좌표는 기기 안에서 측정소를 고르는 데만 쓰고 서버로 보내지 않습니다. 날씨는 지역이 바뀌면 측정소 좌표로 불러옵니다.
  const applyNearestGpsRegion = async () => {
    const region = await locateNearestRegion({ ensureMapStations });
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
    if (willOpen) mainScrollRef.current?.scrollTo({ animated: false, y: 0 });
    setShowHomeRegionSearch(willOpen);
    setShowFavoritePicker(false);
    if (stationItems.length === 0) loadStations();
  };

  const regionFromStation = (station: StationDustItem): RegionState | null => {
    const city = station.sido;
    const region = station.city || station.name;
    return city && region ? { city, region, label: station.name } : null;
  };

  // 홈 지역 검색 결과를 눌렀을 때: 그 장소 근처 측정소의 지역을 홈 기준 지역으로 적용합니다.
  const selectHomeRegionSuggestion = (result: RegionSearchResult) => {
    const region = regionFromStation(result.station);
    if (!region) return;
    applyRegion(region, result.distanceKm === null
      ? `${region.city} ${region.region} 기준으로 변경했습니다.`
      : `${result.title} 근처 ${region.city} ${region.region} 측정소 기준으로 변경했습니다.`);
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
        hydrateTutorial(storedState);
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
      onNavigate={switchTab}
      onTopMeasured={setTabBarTop}
    />
  );

  if (!selectedRegion) {
    return <LocationGate isLocating={isLocating} message={locationMessage} onRetry={applyNearestGpsRegion} />;
  }

  // 토스트와 튜토리얼은 어느 탭 화면에서든 맨 위에 겹쳐 그립니다. 투어는 홈에서만, 캘린더 말풍선은 캘린더를 처음 열 때만.
  const bottomToast = (
    <>
      <BottomToast message={toast?.message ?? ''} showId={toast?.id ?? 0} />
      {activeTab === 'home' && tutorialMode === 'welcome' && (
        <WelcomeSheet onLater={skipTutorialForNow} onStart={() => setTutorialMode('tour')} />
      )}
      {activeTab === 'home' && tutorialMode === 'tour' && (
        <TutorialTour hasHourlyForecast={weatherHourlyItems.length > 0 ? true : weatherForecastResolved ? false : undefined}onContinueCalendar={continueTutorialInCalendar} onFinish={finishTutorial} scrollHome={(y) => mainScrollRef.current?.scrollTo({ animated: true, y })} />
      )}
      {activeTab === 'calendar' && tutorialMode === 'none' && !calendarTipSeen && <CalendarTip onDone={dismissCalendarTip} />}
    </>
  );

  if (activeTab === 'map') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <WeatherBackdrop label={weather?.label} />
        <ScreenTransition transitionKey="map">
        <FullMapScreen
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
          isMapSearching={mapSearch.isMapSearching}
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
        {bottomToast}
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
        key={activeTab}
        ref={mainScrollRef}
        style={styles.screenTransitionScroll}
        contentContainerStyle={[styles.screen, styles.edgeToEdgeScreen]}
        keyboardShouldPersistTaps="handled"
       refreshControl={<RefreshControl colors={[accentTone]} refreshing={isRefreshingCurrent} tintColor={accentTone} onRefresh={loadCurrentDust} />}
      >
        {activeTab === 'home' ? (
          <View>
            <HomeHeader
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
            {showHomeRegionSearch && (
              <HomeRegionSearchPanel
                favoriteRegions={favoriteRegions}
                gpsRegion={gpsRegion}
                isLoadingStations={isLoadingStations}
                isSearching={homeRegionSearch.isSearching}
                onApplyRegion={applyRegion}
                onChangeText={setHomeRegionSearchText}
                onSelectResult={selectHomeRegionSuggestion}
                onToggleFavorite={toggleStationFavorite}
                panelAnimation={homePanelAnimation}
                searchText={homeRegionSearchText}
                selectedRegion={selectedRegion}
                suggestions={homeRegionSearch.results}
              />
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
        {activeTab === 'home' && (
          <HomePanel
            tabBarTop={tabBarTop}
            currentPm10={currentPm10}
            currentPm25={currentPm25}
            currentO3={currentO3}
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
            loading={regionTransition.isTransitioning}
          />
        )}

        {activeTab === 'account' && (
          <RegionPanel
            favoriteRegions={favoriteRegions}
            gpsRegion={gpsRegion}
            isLocating={isLocating}
            isSavingNotificationSettings={isSavingNotificationSettings}
            locationMessage={locationMessage}
            notificationsUnavailable={IS_EXPO_GO}
            notificationSettings={notificationSettings}
            outfitSettings={outfitSettings}
            onRemoveFavorite={removeFavoriteRegion}
            onToggleNotificationSetting={updateNotificationSetting}
            onUpdateOutfitSetting={updateOutfitSetting}
            onOpenTutorial={() => {
              setActiveTab('home');
              setTutorialMode('tour');
            }}
            onUseCurrentLocation={applyNearestGpsRegion}
            selectedRegion={selectedRegion}
          />
        )}
      </ScrollView>
      </ScreenTransition>
      </KeyboardAvoidingView>
      {bottomToast}
      {tabBar}
    </SafeAreaView>
  );
}
