import { useEffect, useState } from 'react';

import type { StationDustItem } from '../../types/dust';
import type { SearchNear } from '../places/naverPlaces';
import { searchPlacesNear } from '../places/placeSearch';
import { findStationSuggestions } from '../stations/stationUtils';
import { placesWithNearestStation, stationResults, type RegionSearchResult } from './regionPlaceSearch';

// 홈·지도 지역 검색: 네이버 장소 검색으로 아무 장소·주소·지역이나 찾고, 각 결과에 가장 가까운 측정소를 붙입니다.
// 검색어(필요하면 기준 지역 이름을 붙인 검색어)만 서버(→네이버)로 보내고, 가까운 측정소·거리 계산은 휴대폰 안에서 합니다.
// near: 이 위치에서 가까운 장소부터 보여 줍니다(내 GPS 지역이나 지금 기준 지역의 측정소). 없으면 네이버가 준 순서.
export function useRegionPlaceSearch(searchText: string, stations: StationDustItem[], near?: SearchNear | null) {
  const [results, setResults] = useState<RegionSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const nearLat = near?.lat;
  const nearLng = near?.lng;
  const nearArea = near?.areaName;

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
        const origin = nearLat === undefined || nearLng === undefined ? null : { areaName: nearArea, lat: nearLat, lng: nearLng };
        next = placesWithNearestStation(await searchPlacesNear(query, origin), stations);
      } catch {
        // 서버·네이버가 안 되면 아래 측정소 이름 검색으로 대신합니다.
      }
      if (!next.length) next = stationResults(findStationSuggestions(stations, query, 6));
      // '대신동'·'삼남읍'처럼 동네 이름을 치면 그 이름의 측정소(=그 동네)를 맨 앞에 둡니다.
      // 주소 검색은 법정동만 찾아서(예: 부산 '대신동'은 동대신동·서대신동) 동네 자체가 안 나올 수 있어서.
      else if (/^[가-힣]+(동|읍|면|리)$/.test(query.trim())) {
        // 이름이 정확히 같은 측정소만('대신동'으로 '대신면'이 끼지 않게).
        const areaStations = stationResults(findStationSuggestions(stations, query, 6).filter((station) => station.name === query.trim()));
        next = [...areaStations, ...next];
      }
      if (cancelled) return;
      setResults(next);
      setIsSearching(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [nearArea, nearLat, nearLng, searchText, stations]);

  return { isSearching, results };
}
