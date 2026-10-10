import type { RegionState } from '../../types/region';

// 두 지역이 같은 시도·시군구인지.
export function isSameRegion(a: RegionState, b: RegionState) {
  return a.city === b.city && a.region === b.region;
}
