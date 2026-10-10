import type { StationDustItem } from '../../types/dust';

// 검색어 비교용: 공백 제거 + 소문자.
export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s/g, '');
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
