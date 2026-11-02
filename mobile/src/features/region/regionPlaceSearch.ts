import type { NaverPlace } from '../places/naverPlaces';
import { nearestStation, stationIdentity } from '../stations/stationUtils';
import type { StationDustItem } from '../../types/dust';

// 홈 지역 검색 결과 한 줄: 검색한 장소(또는 측정소 이름으로 찾은 지역)와 그 근처 측정소.
export type RegionSearchResult = {
  distanceKm: number | null;
  key: string;
  // 검색한 장소의 좌표·출처(가까운 순 정렬에 씀). 측정소 이름으로 찾은 결과에는 없음.
  lat?: number;
  lng?: number;
  source?: string;
  meta: string;
  station: StationDustItem;
  title: string;
};

export function stationLabel(station: StationDustItem) {
  return station.city || station.name || '';
}

// 지역 검색은 '어느 동네 날씨를 볼까'를 고르는 곳이라, 가게·ATM 같은 자잘한 곳은 빼고 랜드마크만 남깁니다.
// 네이버 업종은 '대분류>소분류'(예: '생활,편의>편의점'). 랜드마크 낱말이 들어 있으면 남기고, 아니면 아래 대분류는 뺍니다.
const LANDMARK_WORDS = ['역', '터미널', '공항', '항구', '여객', '공원', '해수욕장', '관광', '명소', '랜드마크', '전망대', '타워', '다리', '산', '계곡', '호수',
  '시장', '백화점', '복합쇼핑몰', '아울렛', '종합병원', '대학병원', '대학교', '시청', '구청', '군청', '주민센터', '행정복지센터', '도서관', '박물관', '미술관',
  '경기장', '야구장', '축구장', '체육관', '놀이공원', '테마파크', '동물원', '수목원', '궁', '성당', '사찰', '해변', '지명', '읍,면,동'];
const MINOR_CATEGORIES = ['음식점', '카페', '술집', '생활,편의', '금융,보험', '미용', '쇼핑,유통', '숙박', '기업', '부동산', '자동차', '가구', '의료', '건강', '반려동물', '인테리어', '패션', '스포츠,오락'];

export function isLandmarkPlace(place: { category?: string; source?: string }) {
  if (place.source === 'naver_geocode') return true; // 주소 검색 결과는 그대로
  const category = place.category ?? '';
  if (!category) return true;
  if (LANDMARK_WORDS.some((word) => category.includes(word))) return true;
  const major = category.split('>')[0];
  return !MINOR_CATEGORIES.some((word) => major.includes(word));
}

// 장소마다 가장 가까운 측정소를 붙입니다. 같은 측정소로 모이는 장소도 각각 남겨 둡니다(사용자가 고른 이름이 다르니까).
export function placesWithNearestStation(places: NaverPlace[], stations: StationDustItem[]): RegionSearchResult[] {
  return places.filter(isLandmarkPlace).flatMap((place, index) => {
    const nearest = nearestStation(stations, place.lat, place.lng);
    if (!nearest) return [];
    return [{
      distanceKm: nearest.distanceKm,
      key: `${place.label}-${place.lat}-${place.lng}-${index}`,
      lat: place.lat,
      lng: place.lng,
      source: place.source,
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
