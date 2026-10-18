import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { DEFAULT_CITY, DEFAULT_REGION, DEFAULT_REGION_STATE } from '../../constants/dust';
import { saveFavoriteRegions, saveGpsRegion, saveSelectedRegion } from '../../storage/appStorage';
import type { StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import { isSameRegion } from './regionUtils';
import { haversineKm, normalizeLatLng } from '../../utils/geo';

const MAX_FAVORITES = 15;

// 앱 기준 지역(선택 지역), GPS로 찾은 지역, 즐겨찾기를 관리하고 저장합니다.
export function useRegions(hasLoadedStore: boolean, notify: (message: string) => void) {
  const [selectedRegion, setSelectedRegion] = useState<RegionState | null>(null);
  const [gpsRegion, setGpsRegion] = useState<RegionState | null>(null);
  const [favoriteRegions, setFavoriteRegions] = useState<RegionState[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  // 저장된 지역을 불러옵니다. 저장된 선택 지역이 기본값뿐이면 GPS 지역을, 그것도 없으면 기본 지역을 씁니다.
  const hydrate = (stored: { favoriteRegions: RegionState[]; gpsRegion: RegionState | null; selectedRegion: RegionState | null }) => {
    const canUseStoredRegion = stored.selectedRegion
      && (!isSameRegion(stored.selectedRegion, DEFAULT_REGION_STATE) || stored.favoriteRegions.length > 0);
    if (stored.gpsRegion) setGpsRegion(stored.gpsRegion);
    setSelectedRegion(canUseStoredRegion ? stored.selectedRegion : stored.gpsRegion ?? DEFAULT_REGION_STATE);
    setFavoriteRegions(stored.favoriteRegions);
  };

  useEffect(() => {
    if (hasLoadedStore && selectedRegion) saveSelectedRegion(selectedRegion);
  }, [hasLoadedStore, selectedRegion]);
  useEffect(() => {
    if (hasLoadedStore && gpsRegion) saveGpsRegion(gpsRegion);
  }, [gpsRegion, hasLoadedStore]);
  useEffect(() => {
    if (hasLoadedStore) saveFavoriteRegions(favoriteRegions);
  }, [favoriteRegions, hasLoadedStore]);

  const removeFavorite = (region: RegionState) => {
    if (!favoriteRegions.some((item) => isSameRegion(item, region))) return;
    setFavoriteRegions(favoriteRegions.filter((item) => !isSameRegion(item, region)));
    notify(`${region.city} ${region.region} 즐겨찾기에서 삭제했어요.`);
  };

  const toggleFavorite = (region: RegionState) => {
    if (favoriteRegions.some((item) => isSameRegion(item, region))) {
      removeFavorite(region);
      return;
    }
    setFavoriteRegions([region, ...favoriteRegions].slice(0, MAX_FAVORITES));
    notify(`${region.city} ${region.region} 즐겨찾기에 추가했어요.`);
  };

  // 현재 GPS 좌표와 가장 가까운 측정소의 지역을 찾습니다. 찾으면 GPS 지역으로 저장하고 돌려줍니다.
  // GPS 좌표는 이 함수 안에서만 쓰고 밖으로(서버로) 내보내지 않습니다. 위치정보법상 기기 안에서만 쓰는 위치는 신고 대상이 아닙니다.
  const locateNearestRegion = async ({ ensureMapStations }: {
    ensureMapStations: () => Promise<StationDustItem[]>;
  }): Promise<RegionState | null> => {
    setIsLocating(true);
    setLocationMessage('위치 권한을 확인하는 중입니다.');
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permission = currentPermission.granted ? currentPermission : await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage('위치 권한이 없어 기본 지역 기준으로 표시합니다.');
        return null;
      }

      setLocationMessage('현재 위치를 가져오는 중입니다.');
      if (!(await Location.hasServicesEnabledAsync())) {
        setLocationMessage('위치 서비스가 꺼져 있어 기본 지역 기준으로 표시합니다.');
        return null;
      }

      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 1000 * 60 * 10 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const gpsCoords = normalizeLatLng(position.coords.latitude, position.coords.longitude);
      if (!gpsCoords) {
        setLocationMessage('현재 위치 좌표가 올바르지 않습니다. 에뮬레이터 Location에서 Latitude와 Longitude 입력값을 확인해 주세요.');
        return null;
      }

      setLocationMessage('가까운 측정소를 찾는 중입니다.');
      const nearest = (await ensureMapStations())
        .map((station) => {
          const stationCoords = normalizeLatLng(station.lat, station.lng);
          return stationCoords
            ? { distance: haversineKm(gpsCoords.lat, gpsCoords.lng, stationCoords.lat, stationCoords.lng), station }
            : null;
        })
        .filter((item): item is { distance: number; station: StationDustItem } => item !== null)
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest) {
        setLocationMessage('가까운 측정소를 찾지 못했습니다.');
        return null;
      }

      const region = {
        city: nearest.station.sido || DEFAULT_CITY,
        label: nearest.station.name,
        region: nearest.station.city || nearest.station.name || DEFAULT_REGION,
      };
      setGpsRegion(region);
      return region;
    } catch (caught) {
      setLocationMessage(caught instanceof Error ? caught.message : '현재 위치를 불러오지 못했습니다.');
      return null;
    } finally {
      setIsLocating(false);
    }
  };

  return {
    favoriteRegions,
    gpsRegion,
    hydrate,
    isLocating,
    locateNearestRegion,
    locationMessage,
    removeFavorite,
    selectedRegion,
    setLocationMessage,
    setSelectedRegion,
    toggleFavorite,
  };
}
