import { searchNaverPlaces } from '../../api/dustEndpoints';
import { localAreaNames, mergePlaces, needsLocalSearch, parseNaverPlaceItems, sortByDistanceFrom, type NaverPlace, type SearchNear } from './naverPlaces';

// 홈·지도·일정 지도 선택이 함께 쓰는 장소 검색.
// 1) 친 검색어 그대로 찾고, 2) 결과가 모두 기준 위치에서 멀면('cgv'·'은행'처럼 흔한 이름이면 네이버가 서울 중구 근처만 줌)
//    기준 지역 이름('부산 대신동')을, 그래도 없으면 시·도 이름('부산')만 붙여 다시 찾아 합친 뒤, 3) 가까운 순으로 정렬합니다.
// 첫 검색이 실패하면 오류를 그대로 던집니다(부르는 쪽이 대신할 결과를 정함). 다시 찾기 실패는 무시합니다.
export async function searchPlacesNear(query: string, near?: SearchNear | null): Promise<NaverPlace[]> {
  const first = parseNaverPlaceItems((await searchNaverPlaces({ query, size: 5 }))?.items);
  if (!near) return first;
  let places = first;
  if (needsLocalSearch(first, near)) {
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
