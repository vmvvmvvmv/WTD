import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import { styles } from '../../styles/appStyles';
import { AppActionIcon } from '../shared/AppActionIcon';
import type { RegionState, StationDustItem, WeatherState } from '../../types/dust';
import { isSameRegion, stationIdentity, uniqueStations } from '../../utils/dust';
import { StationBottomSheet } from './StationBottomSheet';

type FullMapScreenProps = {
  accentBorderTone: string;
  accentTone: string;
  bottomToast: ReactNode;
  dismissMapSearchKeyboard: () => void;
  favoriteRegions: RegionState[];
  focusGpsMapRegion: () => void;
  focusMapStation: (station?: StationDustItem) => void;
  handleMapMessage: (event: { nativeEvent: { data: string } }) => void;
  isLoadingStations: boolean;
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
  openStationDetail: (station: StationDustItem) => void;
  searchSuggestions: StationDustItem[];
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
  accentBorderTone,
  accentTone,
  bottomToast,
  dismissMapSearchKeyboard,
  favoriteRegions,
  focusGpsMapRegion,
  focusMapStation,
  handleMapMessage,
  isLoadingStations,
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
  openStationDetail,
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
  const overlayItems = mapSearchText.trim() ? searchSuggestions : uniqueStations(mapRecentSearches);
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
          <Ionicons color="#c84a4a" name="warning-outline" size={18} />
          <Text style={styles.fullMapErrorText}>{mapLoadError}</Text>
          <Pressable onPress={onRetryMap} style={({ pressed }) => [styles.fullMapRetryButton, pressed && styles.pressedFeedback]}>
            <Text style={styles.fullMapRetryText}>다시 시도</Text>
          </Pressable>
        </View>
      )}
      <View style={[styles.mapSearchBar, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
        <Pressable accessibilityLabel={"\uD648\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30"} onPress={onBackHome} style={({ pressed }) => [styles.mapSearchBackInlineButton, pressed && styles.pressedFeedback]}>
          <Ionicons color="#141821" name="chevron-back" size={21} />
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
          onSubmitEditing={() => focusMapStation(searchSuggestions[0])}
          placeholder={"\uC9C0\uC5ED\uC774\uB098 \uCE21\uC815\uC18C \uAC80\uC0C9"}
          placeholderTextColor="#8a94a3"
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
          {searchSuggestions.map((station, index) => (
            <Pressable
              key={stationIdentity(station) + '-' + index + '-inline'}
              onPressIn={dismissMapSearchKeyboard}
              onPress={() => focusMapStation(station)}
              style={({ pressed }) => [styles.searchSuggestionItem, pressed && styles.pressedFeedback]}
            >
              <Text style={styles.searchSuggestionTitle}>{station.name ?? station.city}</Text>
              <Text style={styles.searchSuggestionMeta}>{[station.sido, station.addr].filter(Boolean).join(' / ')}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isMapSearchFocused && (
        <Animated.View style={[styles.mapSearchOverlay, { opacity: mapSearchOverlayOpacity, transform: [{ translateY: mapSearchOverlayTranslateY }] }]}>
          <View style={[styles.mapSearchOverlayHeader, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
            <Pressable onPress={() => setIsMapSearchFocused(false)} style={({ pressed }) => [styles.mapSearchBackButton, pressed && styles.pressedFeedback]}>
              <Ionicons color="#141821" name="chevron-back" size={21} />
            </Pressable>
            <TextInput
              ref={mapSearchOverlayInputRef}
              autoFocus
              value={mapSearchText}
              onChangeText={(text) => {
                setMapSearchText(text);
                setMapSearchMessage('');
              }}
              onSubmitEditing={() => focusMapStation(searchSuggestions[0])}
              placeholder={"\uC9C0\uC5ED, \uCE21\uC815\uC18C, \uC8FC\uC18C \uAC80\uC0C9"}
              placeholderTextColor="#8a94a3"
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
                <Text style={styles.mapSearchEmptyText}>{"\uC77C\uCE58\uD558\uB294 \uCE21\uC815\uC18C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."}</Text>
              ) : (
                overlayItems.map((station, index) => (
                  <View key={stationIdentity(station) + '-' + index + '-overlay'} style={styles.mapSearchOverlayItem}>
                    <Pressable onPressIn={dismissMapSearchKeyboard} onPress={() => focusMapStation(station)} style={({ pressed }) => [styles.mapSearchOverlaySelect, pressed && styles.pressedFeedback]}>
                      <AppActionIcon name="location" size={25} />
                      <View style={styles.mapSearchOverlayTextGroup}>
                        <Text style={styles.mapSearchOverlayTitle}>{station.sido} {station.city || station.name}</Text>
                        <Text style={styles.mapSearchOverlayMeta}>{[station.name, station.addr].filter(Boolean).join(' / ')}</Text>
                      </View>
                    </Pressable>
                    {!mapSearchText.trim() && (
                      <Pressable accessibilityLabel="최근 검색 삭제" onPress={() => onRemoveRecentSearch(station)} style={({ pressed }) => [styles.mapSearchRemoveButton, pressed && styles.pressedFeedback]}>
                        <Ionicons color="#8a94a3" name="close" size={19} />
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
          onOpenDetail={openStationDetail}
          onToggleFavorite={onToggleFavorite}
          station={selectedStation}
          weather={selectedStationWeather}
        />
      )}
      {bottomToast}
    </View>
  );
}
