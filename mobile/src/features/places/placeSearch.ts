import { searchNaverPlaces } from '../../api/dustEndpoints';
import { loadStationCache } from '../stations/stationCache';
import { localAreaNames, mergePlaces, needsLocalSearch, parseNaverPlaceItems, sortByDistanceFrom, type NaverPlace, type SearchNear } from './naverPlaces';
import { correctPlaceQuery, KNOWN_PLACE_NAMES } from './typoCorrect';

const STATION_NAMES_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// 결과가 없으면 오타일 수 있어 주요 장소·측정소(동네) 이름 중 가장 가까운 이름으로 한 번 더 찾습니다('부산녁' → '부산역').
async function searchCorrected(query: string) {
  const stationNames = ((await loadStationCache(STATION_NAMES_MAX_AGE_MS)) ?? []).map((station) => station.name ?? '').filter(Boolean);
  const corrected = correctPlaceQuery(query, [...KNOWN_PLACE_NAMES, ...stationNames]);
  if (!corrected) return [];
  try {
    return parseNaverPlaceItems((await searchNaverPlaces({ query: corrected, size: 5 }))?.items);
  } catch {
    return [];
  }
}

// 홈·지도·일정 지도 선택이 함께 쓰는 장소 검색.
// 1) 친 검색어 그대로 찾고, 2) 결과가 모두 기준 위치에서 멀면('cgv'·'은행'처럼 흔한 이름이면 네이버가 서울 중구 근처만 줌)
//    기준 지역 이름('부산 대신동')을, 그래도 없으면 시·도 이름('부산')만 붙여 다시 찾아 합친 뒤, 3) 가까운 순으로 정렬합니다.
// 첫 검색이 실패하면 오류를 그대로 던집니다(부르는 쪽이 대신할 결과를 정함). 다시 찾기 실패는 무시합니다.
export async function searchPlacesNear(query: string, near?: SearchNear | null): Promise<NaverPlace[]> {
  let first = parseNaverPlaceItems((await searchNaverPlaces({ query, size: 5 }))?.items);
  if (!first.length) first = await searchCorrected(query);
  if (!near) return first;
  let places = first;
  if (needsLocalSearch(first, near, query)) {
    for (const area of localAreaNames(near.areaName)) {
      try {
        const local = parseNaverPlaceItems((await searchNaverPlaces({ query: `${area} ${query}`, size: 5 }))?.items);
        if (local.length) {
          places = mergePlaces(first, local);
          break;
        }
      } catch {
        break;
      }
    }
  }
  return sortByDistanceFrom(places, near, query);
}
