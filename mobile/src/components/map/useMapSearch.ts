import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, TextInput } from 'react-native';
import type { WebView as WebViewType } from 'react-native-webview';

import { loadStoredWeather, weatherStateFromStation } from '../../features/weather/weatherData';
import { saveMapRecentSearches } from '../../storage/appStorage';
import type { StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import type { WeatherState } from '../../types/weather';
import { useRegionPlaceSearch } from '../../features/region/useRegionPlaceSearch';
import { stationIdentity } from '../../features/stations/stationUtils';
import { normalizeLatLng } from '../../utils/geo';

export function useMapSearch(
  mapStations: StationDustItem[],
  gpsRegion: RegionState | null,
  hasLoadedStore: boolean,
  isMapActive: boolean,
  todayDateLabel: string,
) {
  const [mapSearchText, setMapSearchText] = useState('');
  const [mapSearchMessage, setMapSearchMessage] = useState('');
  const [isMapSearchFocused, setIsMapSearchFocused] = useState(false);
  const [mapMarkerMode, setMapMarkerMode] = useState<'dust' | 'weather'>('weather');
  const [mapRecentSearches, setMapRecentSearches] = useState<StationDustItem[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedStation, setSelectedStation] = useState<StationDustItem | null>(null);
  const [selectedStationWeather, setSelectedStationWeather] = useState<WeatherState | null>(null);
  const [mapViewKey, setMapViewKey] = useState(0);
  const mapWebViewRef = useRef<WebViewType>(null);
  const mapSearchInputRef = useRef<TextInput | null>(null);
  const mapSearchOverlayInputRef = useRef<TextInput | null>(null);
  const mapSearchOverlayOpacity = useRef(new Animated.Value(0)).current;
  const mapSearchOverlayTranslateY = useRef(new Animated.Value(18)).current;

  // 아무 장소·주소·지역이나 찾고, 고르면 그 근처 측정소로 지도를 옮깁니다(홈 지역 검색과 같은 방식).
  const { isSearching: isMapSearching, results: searchSuggestions } = useRegionPlaceSearch(mapSearchText, mapStations);

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

  const dismissMapSearchKeyboard = () => {
    mapSearchInputRef.current?.blur();
    mapSearchOverlayInputRef.current?.blur();
    Keyboard.dismiss();
    setTimeout(() => {
      mapSearchInputRef.current?.blur();
      mapSearchOverlayInputRef.current?.blur();
      Keyboard.dismiss();
    }, 80);
    setTimeout(() => Keyboard.dismiss(), 220);
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

  // label: 검색한 장소 이름. 있으면 검색창에 그 이름을 남깁니다(없으면 측정소 이름).
  const focusMapStation = (station?: StationDustItem, label?: string) => {
    const coords = normalizeLatLng(station?.lat, station?.lng);
    if (!station || !coords) {
      setMapSearchMessage('검색 결과가 없습니다.');
      return;
    }
    const normalizedStation = { ...station, lat: coords.lat, lng: coords.lng };
    setShowSearchSuggestions(false);
    setIsMapSearchFocused(false);
    dismissMapSearchKeyboard();
    setMapSearchText(label ?? station.name ?? station.city ?? mapSearchText);
    setMapSearchMessage(`${label ? `${label} 근처 · ` : ''}${station.sido ?? ''} ${station.name ?? station.city ?? ''}`.trim());
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

  const closeMapSearch = () => {
    Keyboard.dismiss();
    setIsMapSearchFocused(false);
    setShowSearchSuggestions(false);
  };

  const removeMapRecentSearch = (station: StationDustItem) => {
    setMapRecentSearches((items) => items.filter((item) => !(item.sido === station.sido && item.name === station.name && item.city === station.city)));
  };

  useEffect(() => {
    if (!hasLoadedStore) return;
    void saveMapRecentSearches(mapRecentSearches);
  }, [hasLoadedStore, mapRecentSearches]);

  useEffect(() => {
    const coords = normalizeLatLng(selectedStation?.lat, selectedStation?.lng);
    if (!coords) {
      setSelectedStationWeather(null);
      return;
    }
    let isActive = true;
    loadStoredWeather(coords.lat, coords.lng, todayDateLabel)
      .then((data) => {
        if (isActive) setSelectedStationWeather(data.weather ?? weatherStateFromStation(selectedStation));
      })
      .catch(() => {
        if (isActive) setSelectedStationWeather(weatherStateFromStation(selectedStation));
      });
    return () => { isActive = false; };
  }, [selectedStation, todayDateLabel]);

  useEffect(() => {
    if (!isMapActive || !isMapSearchFocused) {
      mapSearchOverlayOpacity.setValue(0);
      mapSearchOverlayTranslateY.setValue(18);
      return;
    }
    mapSearchOverlayOpacity.setValue(0);
    mapSearchOverlayTranslateY.setValue(18);
    Animated.parallel([
      Animated.timing(mapSearchOverlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.spring(mapSearchOverlayTranslateY, { toValue: 0, damping: 17, stiffness: 190, useNativeDriver: true }),
    ]).start();
  }, [isMapActive, isMapSearchFocused, mapSearchOverlayOpacity, mapSearchOverlayTranslateY]);

  return {
    closeMapSearch, dismissMapSearchKeyboard, findStationForRegion, focusGpsMapRegion, focusMapStation,
    isMapSearchFocused, isMapSearching, mapMarkerMode, mapRecentSearches, mapSearchInputRef, mapSearchMessage,
    mapSearchOverlayInputRef, mapSearchOverlayOpacity, mapSearchOverlayTranslateY, mapSearchText,
    mapViewKey, mapWebViewRef, removeMapRecentSearch, searchSuggestions, selectedStation,
    selectedStationWeather, setIsMapSearchFocused, setMapRecentSearches, setMapSearchMessage,
    setMapSearchText, setMapViewKey, setSelectedStation, setSelectedStationWeather,
    setShowSearchSuggestions, showSearchSuggestions, switchMapMarkerMode,
  };
}
