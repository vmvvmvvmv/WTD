import { useEffect, useState } from 'react';

import { searchNaverPlaces } from '../../api/dustEndpoints';
import type { StationDustItem } from '../../types/dust';
import { parseNaverPlaceItems } from '../places/naverPlaces';
import { findStationSuggestions } from '../stations/stationUtils';
import { placesWithNearestStation, stationResults, type RegionSearchResult } from './regionPlaceSearch';

// 홈 지역 검색: 네이버 장소 검색으로 아무 장소·주소·지역이나 찾고, 각 결과에 가장 가까운 측정소를 붙입니다.
// 검색어만 서버(→네이버)로 보내고, 가까운 측정소 계산은 휴대폰 안에서 합니다.
export function useRegionPlaceSearch(searchText: string, stations: StationDustItem[]) {
  const [results, setResults] = useState<RegionSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const query = searchText.trim();
    if (!query) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    // 글자를 칠 때마다 요청하지 않게 잠깐 기다립니다.
    const timer = setTimeout(async () => {
      let next: RegionSearchResult[] = [];
      try {
        next = placesWithNearestStation(parseNaverPlaceItems((await searchNaverPlaces({ query, size: 5 }))?.items), stations);
      } catch {
        // 서버·네이버가 안 되면 아래 측정소 이름 검색으로 대신합니다.
      }
      if (!next.length) next = stationResults(findStationSuggestions(stations, query, 6));
      if (cancelled) return;
      setResults(next);
      setIsSearching(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, stations]);

  return { isSearching, results };
}
