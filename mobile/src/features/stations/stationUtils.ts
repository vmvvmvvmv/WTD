import type { StationDustItem } from '../../types/dust';

// 검색어 비교용: 행정구역 접미사·공백 제거 + 소문자.
// 접미사는 앞이 두 글자 이상일 때만 뗍니다. '중구'를 '중'으로 줄이면 '중동'·'중앙동'까지 걸려서입니다.
export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/([가-힣]{2,}?)(?:특별시|광역시|특별자치시|특별자치도|시|군|구|읍|면|동|도)(?=\s|$)/g, '$1').replace(/\s/g, '');
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
