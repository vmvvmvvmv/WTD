import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import { styles } from '../../styles/appStyles';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import { AppActionIcon } from '../shared/AppActionIcon';
import type { StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import type { WeatherState } from '../../types/weather';
import { formatDistanceKm, stationLabel, stationResults, type RegionSearchResult } from '../../features/region/regionPlaceSearch';
import { isSameRegion } from '../../features/region/regionUtils';
import { uniqueStations } from '../../features/stations/stationUtils';
import { StationBottomSheet } from './StationBottomSheet';
import { accentBorderTone, accentTone } from '../../theme/appTheme';

type FullMapScreenProps = {
  bottomToast: ReactNode;
  dismissMapSearchKeyboard: () => void;
  favoriteRegions: RegionState[];
  focusGpsMapRegion: () => void;
  focusMapStation: (station?: StationDustItem, label?: string) => void;
  handleMapMessage: (event: { nativeEvent: { data: string } }) => void;
  isLoadingStations: boolean;
  isMapSearching: boolean;
  isMapSearchFocused: boolean;
  mapMarkerMode: 'dust' | 'weather';
  mapRecentSearches: StationDustItem[];
  mapSearchInputRef: RefObject<TextInput | null>;
  mapSearchMessage: string;
  mapSearchOverlayInputRef: RefObject<TextInput | null>;
  mapSearchOverlayOpacity: Animated.Value;
  mapSearchOverlayTranslateY: Animated.Value;
  mapSearchText: string;
  mapUrl: string;
  mapViewKey: number;
  mapWebViewRef: RefObject<WebViewType | null>;
  onBackHome: () => void;
  onClearRecentSearches: () => void;
  onRemoveRecentSearch: (station: StationDustItem) => void;
  onRetryMap: () => void;
  onToggleFavorite: (station: StationDustItem) => void;
  searchSuggestions: RegionSearchResult[];
  selectedStation: StationDustItem | null;
  selectedStationWeather?: WeatherState | null;
  setIsMapSearchFocused: (value: boolean) => void;
  setMapSearchMessage: (value: string) => void;
  setMapSearchText: (value: string) => void;
  setSelectedStation: (station: StationDustItem | null) => void;
  setShowSearchSuggestions: (value: boolean) => void;
  showSearchSuggestions: boolean;
  switchMapMarkerMode: (mode: 'dust' | 'weather') => void;
};

// The full map surface stays separate from App so search, marker mode, and bottom sheet UI evolve together.
export function FullMapScreen({
  bottomToast,
  dismissMapSearchKeyboard,
  favoriteRegions,
  focusGpsMapRegion,
  focusMapStation,
  handleMapMessage,
  isLoadingStations,
  isMapSearching,
  isMapSearchFocused,
  mapMarkerMode,
  mapRecentSearches,
  mapSearchInputRef,
  mapSearchMessage,
  mapSearchOverlayInputRef,
  mapSearchOverlayOpacity,
  mapSearchOverlayTranslateY,
  mapSearchText,
  mapUrl,
  mapViewKey,
  mapWebViewRef,
  onBackHome,
  onClearRecentSearches,
  onRemoveRecentSearch,
  onRetryMap,
  onToggleFavorite,
  searchSuggestions,
  selectedStation,
  selectedStationWeather,
  setIsMapSearchFocused,
  setMapSearchMessage,
  setMapSearchText,
  setSelectedStation,
  setShowSearchSuggestions,
  showSearchSuggestions,
  switchMapMarkerMode,
}: FullMapScreenProps) {
  // 검색어가 있으면 장소 검색 결과(근처 측정소 포함), 없으면 최근에 본 측정소.
  const overlayItems = mapSearchText.trim() ? searchSuggestions : stationResults(uniqueStations(mapRecentSearches));
  // 장소로 찾은 결과면 그 장소 이름을, 측정소 이름으로 찾은 결과면 측정소를 그대로 씁니다.
  const focusResult = (result?: RegionSearchResult) => {
    if (result) focusMapStation(result.station, result.distanceKm === null ? undefined : result.title);
  };
  const [mapLoadError, setMapLoadError] = useState('');

  return (
    <View style={styles.fullMapContainer}>
      <WebView
        key={mapViewKey}
        ref={mapWebViewRef}
        source={{ uri: mapUrl }}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        mixedContentMode="always"
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        thirdPartyCookiesEnabled
        onLoadStart={() => setMapLoadError('')}
        onError={(event) => {
          const { code, description } = event.nativeEvent;
          setMapLoadError(`지도 페이지를 불러오지 못했어요. (${code}: ${description})`);
        }}
        onHttpError={(event) => {
          const { statusCode } = event.nativeEvent;
          setMapLoadError(`지도 페이지 응답 오류가 있어요. (HTTP ${statusCode})`);
        }}
        onMessage={handleMapMessage}
        style={styles.fullMapWebView}
      />
      {!!mapLoadError && (
        <View style={styles.fullMapErrorBanner}>
          <Ionicons color={bauhausColors.red} name="warning-outline" size={18} />
          <Text style={styles.fullMapErrorText}>{mapLoadError}</Text>
          <Pressable onPress={onRetryMap} style={({ pressed }) => [styles.fullMapRetryButton, pressed && styles.pressedFeedback]}>
            <Text style={styles.fullMapRetryText}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      <View style={[styles.mapSearchBar, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
        <Pressable accessibilityLabel={"\uD648\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"} onPress={onBackHome} style={({ pressed }) => [styles.mapSearchBackInlineButton, pressed && styles.pressedFeedback]}>
          <Ionicons color={textColors.primary} name="chevron-back" size={21} />
        </Pressable>
        <TextInput
          ref={mapSearchInputRef}
          value={mapSearchText}
          onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 120)}
          onChangeText={(text) => {
            setMapSearchText(text);
            setMapSearchMessage('');
            setShowSearchSuggestions(true);
          }}
          onFocus={() => {
            setIsMapSearchFocused(true);
            setShowSearchSuggestions(false);
          }}
          onSubmitEditing={() => focusResult(searchSuggestions[0])}
          placeholder="장소, 주소, 지역 검색"
          placeholderTextColor={textColors.muted}
          returnKeyType="search"
          style={styles.mapSearchInput}
        />
        <Pressable accessibilityLabel={"GPS \uAE30\uC900 \uC9C0\uC5ED\uC73C\uB85C \uC774\uB3D9"} onPress={focusGpsMapRegion} style={({ pressed }) => [styles.mapSearchGpsButton, pressed && styles.pressedFeedback]}>
          <AppActionIcon name="location" size={25} />
        </Pressable>
      </View>
      {!showSearchSuggestions && !isMapSearchFocused && (
        <View style={[styles.mapMarkerModeControl, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
          {(['weather', 'dust'] as const).map((mode) => {
            const active = mapMarkerMode === mode;
            return (
              <Pressable
                accessibilityLabel={`${mode === 'weather' ? '기온' : '미세먼지'} 지도 보기`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={mode}
                onPress={() => switchMapMarkerMode(mode)}
                style={({ pressed }) => [
                  styles.mapMarkerModeButton,
                  active && { backgroundColor: accentTone },
                  pressed && styles.pressedFeedback,
                ]}
              >
                <Ionicons color={active ? '#FFFFFF' : mode === 'weather' ? '#E18B2D' : accentTone} name={mode === 'weather' ? 'thermometer-outline' : 'leaf-outline'} size={16} />
                <Text style={[styles.mapMarkerModeButtonText, active && styles.mapMarkerModeButtonTextActive]}>{mode === 'weather' ? '기온' : '미세먼지'}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {showSearchSuggestions && !isMapSearchFocused && searchSuggestions.length > 0 && (
        <View style={[styles.searchSuggestions, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
          {searchSuggestions.map((result) => (
            <Pressable
              key={`${result.key}-inline`}
              onPressIn={dismissMapSearchKeyboard}
              onPress={() => focusResult(result)}
              style={({ pressed }) => [styles.searchSuggestionItem, pressed && styles.pressedFeedback]}
            >
              <Text style={styles.searchSuggestionTitle}>{result.title}</Text>
              <Text style={styles.searchSuggestionMeta}>{result.meta}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isMapSearchFocused && (
        <Animated.View style={[styles.mapSearchOverlay, { opacity: mapSearchOverlayOpacity, transform: [{ translateY: mapSearchOverlayTranslateY }] }]}>
          <View style={[styles.mapSearchOverlayHeader, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
            <Pressable onPress={() => setIsMapSearchFocused(false)} style={({ pressed }) => [styles.mapSearchBackButton, pressed && styles.pressedFeedback]}>
              <Ionicons color={textColors.primary} name="chevron-back" size={21} />
            </Pressable>
            <TextInput
              ref={mapSearchOverlayInputRef}
              autoFocus
              value={mapSearchText}
              onChangeText={(text) => {
                setMapSearchText(text);
                setMapSearchMessage('');
              }}
              onSubmitEditing={() => focusResult(searchSuggestions[0])}
              placeholder="장소, 주소, 지역 검색"
              placeholderTextColor={textColors.muted}
              returnKeyType="search"
              style={styles.mapSearchOverlayInput}
            />
            <Pressable accessibilityLabel={"GPS \uAE30\uC900 \uC9C0\uC5ED\uC73C\uB85C \uC774\uB3D9"} onPress={focusGpsMapRegion} style={({ pressed }) => [styles.mapSearchOverlayGpsButton, pressed && styles.pressedFeedback]}>
              <AppActionIcon name="location" size={25} />
            </Pressable>
          </View>
          {(mapSearchText.trim() || mapRecentSearches.length > 0) && (
            <View style={styles.mapSearchModeRow}>
              <Text style={[styles.mapSearchModePill, mapSearchText.trim() && styles.mapSearchModePillMuted]}>
                {mapSearchText.trim() ? "\uAC80\uC0C9 \uACB0\uACFC" : "\uCD5C\uADFC \uAC80\uC0C9"}
              </Text>
              {!mapSearchText.trim() && (
                <Pressable onPress={onClearRecentSearches} style={({ pressed }) => [styles.mapSearchClearButton, pressed && styles.pressedFeedback]}>
                  <Text style={styles.mapSearchClearText}>{"\uC804\uCCB4 \uC0AD\uC81C"}</Text>
                </Pressable>
              )}
            </View>
          )}
          {(mapSearchText.trim() || mapRecentSearches.length > 0) && (
            <View style={[styles.mapSearchOverlayList, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
              {overlayItems.length === 0 ? (
                <Text style={styles.mapSearchEmptyText}>{isMapSearching ? '찾는 중입니다.' : '찾는 장소가 없습니다. 다른 이름이나 주소로 찾아보세요.'}</Text>
              ) : (
                overlayItems.map((result) => (
                  <View key={`${result.key}-overlay`} style={styles.mapSearchOverlayItem}>
                    <Pressable onPressIn={dismissMapSearchKeyboard} onPress={() => focusResult(result)} style={({ pressed }) => [styles.mapSearchOverlaySelect, pressed && styles.pressedFeedback]}>
                      <AppActionIcon name="location" size={25} />
                      <View style={styles.mapSearchOverlayTextGroup}>
                        <Text numberOfLines={1} style={styles.mapSearchOverlayTitle}>{result.title}</Text>
                        {!!result.meta && <Text numberOfLines={1} style={styles.mapSearchOverlayMeta}>{result.meta}</Text>}
                        {result.distanceKm !== null && (
                          <Text numberOfLines={1} style={[styles.mapSearchOverlayMeta, { color: accentTone }]}>
                            {`근처 측정소 ${result.station.sido ?? ''} ${stationLabel(result.station)} · ${formatDistanceKm(result.distanceKm)}`}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                    {!mapSearchText.trim() && (
                      <Pressable accessibilityLabel="최근 검색 삭제" onPress={() => onRemoveRecentSearch(result.station)} style={({ pressed }) => [styles.mapSearchRemoveButton, pressed && styles.pressedFeedback]}>
                        <Ionicons color={textColors.muted} name="close" size={19} />
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </Animated.View>
      )}
      {!!mapSearchMessage && <Text style={[styles.mapSearchMessage, { borderColor: accentBorderTone }]}>{mapSearchMessage}</Text>}
      {isLoadingStations && (
        <View style={[styles.mapLoadingBadge, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
          <ActivityIndicator color={accentTone} />
          <Text style={styles.mapLoadingText}>{"\uC9C0\uB3C4 \uAC31\uC2E0 \uC911"}</Text>
        </View>
      )}
      {selectedStation && (
        <StationBottomSheet
          isFavorite={favoriteRegions.some((region) => isSameRegion(region, { city: selectedStation.sido ?? '', region: selectedStation.city || selectedStation.name || '' }))}
          mode={mapMarkerMode}
          onClose={() => setSelectedStation(null)}
          onToggleFavorite={onToggleFavorite}
          station={selectedStation}
          weather={selectedStationWeather}
        />
      )}
      {bottomToast}
    </View>
  );
}
