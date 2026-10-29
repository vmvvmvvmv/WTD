import type { NaverPlace } from '../places/naverPlaces';
import { nearestStation, stationIdentity } from '../stations/stationUtils';
import type { StationDustItem } from '../../types/dust';

// 홈 지역 검색 결과 한 줄: 검색한 장소(또는 측정소 이름으로 찾은 지역)와 그 근처 측정소.
export type RegionSearchResult = {
  distanceKm: number | null;
  key: string;
  meta: string;
  station: StationDustItem;
  title: string;
};

export function stationLabel(station: StationDustItem) {
  return station.city || station.name || '';
}

// 장소마다 가장 가까운 측정소를 붙입니다. 같은 측정소로 모이는 장소도 각각 남겨 둡니다(사용자가 고른 이름이 다르니까).
export function placesWithNearestStation(places: NaverPlace[], stations: StationDustItem[]): RegionSearchResult[] {
  return places.flatMap((place, index) => {
    const nearest = nearestStation(stations, place.lat, place.lng);
    if (!nearest) return [];
    return [{
      distanceKm: nearest.distanceKm,
      key: `${place.label}-${place.lat}-${place.lng}-${index}`,
      meta: place.address || place.category || '',
      station: nearest.station,
      title: place.label,
    }];
  });
}

// 장소 검색이 안 되거나 결과가 없을 때: 예전처럼 측정소 이름·지역으로 찾은 결과.
export function stationResults(stations: StationDustItem[]): RegionSearchResult[] {
  return stations.map((station) => ({
    distanceKm: null,
    key: stationIdentity(station),
    meta: [station.name, station.addr].filter(Boolean).join(' / '),
    station,
    title: `${station.sido ?? ''} ${stationLabel(station)}`.trim(),
  }));
}

export function formatDistanceKm(distanceKm: number) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(1)}km`;
}
