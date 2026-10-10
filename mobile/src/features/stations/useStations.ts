import { useMemo, useState } from 'react';

import { getKoreaStations } from '../../api/dustEndpoints';
import type { StationDustItem } from '../../types/dust';
import { normalizeLatLng } from '../../utils/geo';
import { loadStationCache, saveStationCache } from './stationCache';

// 전국 측정소 목록(지도·지역 검색·가까운 측정소 찾기에 공통으로 씀)을 불러오고 캐시합니다.
export function useStations() {
  const [stationItems, setStationItems] = useState<StationDustItem[]>([]);
  const [isLoadingStations, setIsLoadingStations] = useState(false);
  const mapStations = useMemo(
    () => stationItems.filter((station) => normalizeLatLng(station.lat, station.lng)),
    [stationItems],
  );

  const loadStations = async () => {
    setIsLoadingStations(true);
    try {
      const cachedStations = await loadStationCache();
      if (cachedStations?.length) setStationItems(cachedStations);
      const stationData = await getKoreaStations();
      const nextStations = (stationData.items as StationDustItem[] | undefined) ?? [];
      setStationItems(nextStations);
      saveStationCache(nextStations);
    } finally {
      setIsLoadingStations(false);
    }
  };

  // 좌표가 있는 측정소가 하나라도 필요할 때: 화면에 있는 목록 → 캐시 → 서버 순서로 찾습니다.
  const ensureMapStations = async () => {
    if (mapStations.length > 0) return mapStations;
    const cachedStations = await loadStationCache();
    if (cachedStations?.length) {
      setStationItems(cachedStations);
      const cachedMapStations = cachedStations.filter((station) => normalizeLatLng(station.lat, station.lng));
      if (cachedMapStations.length > 0) return cachedMapStations;
    }
    const stationData = await getKoreaStations();
    const nextStations = (stationData.items ?? []) as StationDustItem[];
    setStationItems(nextStations);
    saveStationCache(nextStations);
    return nextStations.filter((station) => normalizeLatLng(station.lat, station.lng));
  };

  return { ensureMapStations, isLoadingStations, loadStations, mapStations, setStationItems, stationItems };
}
