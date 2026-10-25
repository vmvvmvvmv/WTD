import { useRef } from 'react';

import type { StationDustItem } from '../types/dust';
import type { TabKey } from '../types/navigation';
import type { RegionState } from '../types/region';
import { normalizeLatLng } from '../utils/geo';
import { buildMobileMapUrl } from '../utils/mobileMapUrl';

// 홈 지도 미리보기, 전체 지도, 일정 장소 고르기 지도의 주소와 일정 기본 장소를 정합니다.
// 기준은 현재 위치(GPS) 지역의 측정소, 없으면 선택 지역의 측정소입니다.
export function useAppMapUrls({
  activeTab,
  findStationForRegion,
  gpsRegion,
  mapMarkerMode,
  selectedRegion,
}: {
  activeTab: TabKey;
  findStationForRegion: (region: RegionState | null) => StationDustItem | null | undefined;
  gpsRegion: RegionState | null;
  mapMarkerMode: 'dust' | 'weather';
  selectedRegion: RegionState | null;
}) {
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
  return { calendarDefaultLocation, calendarMapPickerUrl, fullMapUrl, homeMapPreviewUrl };
}
