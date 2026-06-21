import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import { styles } from '../../styles/appStyles';
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
          <Ionicons color={accentTone} name="locate-outline" size={22} />
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel={mapMarkerMode === 'dust' ? "\uB0A0\uC528 \uAE30\uC900 \uB9C8\uCEE4\uB85C \uBCC0\uACBD" : "\uBBF8\uC138\uBA3C\uC9C0 \uAE30\uC900 \uB9C8\uCEE4\uB85C \uBCC0\uACBD"}
        onPress={() => switchMapMarkerMode(mapMarkerMode === 'dust' ? 'weather' : 'dust')}
        style={({ pressed }) => [styles.mapMarkerModeIconButton, { borderColor: accentBorderTone, shadowColor: accentTone }, pressed && styles.pressedFeedback]}
      >
        <Ionicons color={mapMarkerMode === 'dust' ? accentTone : '#f3b43f'} name={mapMarkerMode === 'dust' ? 'leaf-outline' : 'partly-sunny-outline'} size={22} />
      </Pressable>
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
              <Ionicons color={accentTone} name="locate-outline" size={22} />
            </Pressable>
          </View>
          <View style={styles.mapSearchModeRow}>
            <Text style={[styles.mapSearchModePill, { backgroundColor: accentTone }, mapSearchText.trim() && styles.mapSearchModePillMuted]}>
              {mapSearchText.trim() ? "\uAC80\uC0C9 \uACB0\uACFC" : "\uCD5C\uADFC \uAC80\uC0C9"}
            </Text>
            {!mapSearchText.trim() && mapRecentSearches.length > 0 && (
              <Pressable onPress={onClearRecentSearches} style={({ pressed }) => [styles.mapSearchClearButton, pressed && styles.pressedFeedback]}>
                <Text style={styles.mapSearchClearText}>{"\uC804\uCCB4 \uC0AD\uC81C"}</Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.mapSearchOverlayList, { borderColor: accentBorderTone, shadowColor: accentTone }]}>
            {overlayItems.length === 0 ? (
              <Text style={styles.mapSearchEmptyText}>
                {mapSearchText.trim() ? "\uC77C\uCE58\uD558\uB294 \uCE21\uC815\uC18C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." : "\uCD5C\uADFC \uAC80\uC0C9\uD55C \uC9C0\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
              </Text>
            ) : (
              overlayItems.map((station, index) => (
                <View key={stationIdentity(station) + '-' + index + '-overlay'} style={styles.mapSearchOverlayItem}>
                  <Pressable onPressIn={dismissMapSearchKeyboard} onPress={() => focusMapStation(station)} style={({ pressed }) => [styles.mapSearchOverlaySelect, pressed && styles.pressedFeedback]}>
                    <Ionicons color="#687180" name="location-outline" size={20} />
                    <View style={styles.mapSearchOverlayTextGroup}>
                      <Text style={styles.mapSearchOverlayTitle}>{station.sido} {station.city || station.name}</Text>
                      <Text style={styles.mapSearchOverlayMeta}>{[station.name, station.addr].filter(Boolean).join(' / ')}</Text>
                    </View>
                  </Pressable>
                  {!mapSearchText.trim() && (
                    <Pressable onPress={() => onRemoveRecentSearch(station)} style={({ pressed }) => [styles.mapSearchRemoveButton, pressed && styles.pressedFeedback]}>
                      <Ionicons color="#8a94a3" name="close" size={19} />
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
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
