import { useEffect, useRef } from 'react';
import { BackHandler, Keyboard } from 'react-native';

import { weatherStateFromStation } from '../../features/weather/weatherData';
import type { StationDustItem } from '../../types/dust';
import type { TabKey } from '../../types/navigation';
import type { useMapSearch } from './useMapSearch';

type MapSearch = ReturnType<typeof useMapSearch>;

// 지도 탭에 들어오고 나갈 때의 정리, 뒤로가기, 지도(WebView)에서 온 마커 선택을 처리합니다.
export function useMapTabLifecycle(map: MapSearch, activeTab: TabKey, goHome: () => void) {
  const previousTabRef = useRef<TabKey>(activeTab);
  const isMapTab = activeTab === 'map';

  const resetSearch = () => {
    map.setSelectedStation(null);
    map.setMapSearchText('');
    map.setMapSearchMessage('');
    map.setShowSearchSuggestions(false);
  };

  // 지도 탭을 떠나면 선택 마커와 그 안내 문구를 지우고 다음에 지도를 새로 그립니다.
  // 문구만 남으면 다시 들어왔을 때 선택도 안 된 측정소 이름이나 "검색 결과가 없습니다"가 보인다.
  useEffect(() => {
    if (previousTabRef.current === 'map' && !isMapTab) {
      map.setSelectedStation(null);
      map.setMapSearchMessage('');
      map.setMapViewKey((key) => key + 1);
    }
    previousTabRef.current = activeTab;
    // 탭이 바뀔 때만 다시 겁니다(map의 setter들은 바뀌지 않음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 지도 탭을 5분 이상 보지 않으면 선택 마커와 검색 상태를 초기화합니다.
  useEffect(() => {
    if (isMapTab) return;
    const timer = setTimeout(() => {
      resetSearch();
      map.setMapViewKey((key) => key + 1);
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
    // 탭이 바뀔 때만 다시 겁니다(map의 setter들은 바뀌지 않음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Android 뒤로가기: 검색창 → 선택 마커 → 검색어 순서로 닫고, 아무것도 없으면 홈으로 갑니다.
  useEffect(() => {
    if (!isMapTab) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      Keyboard.dismiss();
      if (map.isMapSearchFocused) {
        map.closeMapSearch();
        return true;
      }
      if (map.selectedStation) {
        map.setSelectedStation(null);
        return true;
      }
      if (map.mapSearchText || map.mapSearchMessage || map.showSearchSuggestions) {
        map.setMapSearchText('');
        map.setMapSearchMessage('');
        map.setShowSearchSuggestions(false);
        return true;
      }
      resetSearch();
      goHome();
      return true;
    });
    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, map.isMapSearchFocused, map.mapSearchMessage, map.mapSearchText, map.selectedStation, map.showSearchSuggestions]);

  // WebView 안의 네이버 지도에서 보낸 마커 선택 이벤트.
  const handleMapMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: string; station?: StationDustItem };
      if (payload.type === 'station-selected' && payload.station) {
        Keyboard.dismiss();
        map.setIsMapSearchFocused(false);
        map.setSelectedStation(payload.station);
        map.setSelectedStationWeather(weatherStateFromStation(payload.station));
        map.setMapSearchMessage('');
        map.setShowSearchSuggestions(false);
      }
    } catch {
      // 지도에서 오는 JSON이 아닌 메시지는 무시합니다.
    }
  };

  return { handleMapMessage };
}
