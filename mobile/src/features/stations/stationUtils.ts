import type { StationDustItem } from '../../types/dust';
import type { RegionState } from '../../types/region';
import { haversineKm, normalizeLatLng } from '../../utils/geo';

// 검색어 비교용: 행정구역 접미사·공백 제거 + 소문자.
// 접미사는 앞이 두 글자 이상일 때만 뗍니다. '중구'를 '중'으로 줄이면 '중동'·'중앙동'까지 걸려서입니다.
export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/([가-힣]{2,}?)(?:특별시|광역시|특별자치시|특별자치도|시|군|구|읍|면|동|도)(?=\s|$)/g, '$1').replace(/\s/g, '');
}

// 좌표에서 가장 가까운 측정소와 거리(km). 좌표가 없는 측정소는 건너뜁니다.
export function nearestStation(stations: StationDustItem[], lat: number, lng: number) {
  let best: { distanceKm: number; station: StationDustItem } | null = null;
  for (const station of stations) {
    const coords = normalizeLatLng(station.lat, station.lng);
    if (!coords) continue;
    const distanceKm = haversineKm(lat, lng, coords.lat, coords.lng);
    if (!best || distanceKm < best.distanceKm) best = { distanceKm, station };
  }
  return best;
}

// 측정소 중복 제거·React key에 쓰는 고유 문자열.
export function stationIdentity(station: StationDustItem) {
  return [
    station.sido ?? '',
    station.city ?? '',
    station.name ?? '',
    station.addr ?? '',
    station.lat ?? '',
    station.lng ?? '',
  ].join('|');
}

// 같은 측정소가 검색 결과에 여러 번 나오지 않게 합니다.
export function uniqueStations(stations: StationDustItem[]) {
  const seen = new Set<string>();
  return stations.filter((station) => {
    const key = stationIdentity(station);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 측정소 이름·지역으로 찾기(장소 검색이 안 될 때 대신 씁니다).
export function findStationSuggestions(stations: StationDustItem[], searchText: string, limit: number) {
  const keyword = normalizeSearchText(searchText.trim());
  if (!keyword) return [];
  return uniqueStations(stations.filter((station) => {
    const target = normalizeSearchText([station.sido, station.city, station.name, station.addr].filter(Boolean).join(' '));
    return target.includes(keyword);
  })).slice(0, limit);
}

// 지역(시도·시군구)에 해당하는 측정소. 이름이 딱 맞는 것부터, 없으면 주소에 지역 이름이 들어간 것.
export function stationForRegion(stations: StationDustItem[], region?: RegionState | null) {
  if (!region) return undefined;
  return stations.find((station) => (
    station.sido === region.city
    && (station.city === region.region || station.name === region.region || station.name === region.label)
  )) ?? stations.find((station) => (
    station.sido === region.city
    && [station.city, station.name, station.addr].filter(Boolean).some((value) => String(value).includes(region.region))
  ));
}
