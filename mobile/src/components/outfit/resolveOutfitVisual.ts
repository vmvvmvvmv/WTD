import type { OutfitRecommendation } from '../../types/outfit';

export type OutfitVisualKey = 'sport' | 'sportCool' | 'sportCold' | 'heatwave' | 'hot' | 'warm' | 'mild' | 'cool' | 'cold' | 'freezing';

export function resolveOutfitVisual(result: OutfitRecommendation): OutfitVisualKey {
  const band = result.outfit.band;
  if (result.occasion === 'running' || result.occasion === 'sport') {
    if (band === 'B1' || band === 'B2') return 'sport';
    if (band === 'B3' || band === 'B4' || band === 'B5') return 'sportCool';
    if (band === 'B6' || band === 'B7' || band === 'B8' || band === 'B9') return 'sportCold';
  }
  if ((band === 'B1' || band === 'B2') && result.must_have.some((item) => item.type === 'sun_parasol')) return 'heatwave';
  switch (band) {
    case 'B1':
    case 'B2':
      return 'hot';
    case 'B3':
      return 'warm';
    case 'B4':
      return 'mild';
    case 'B5':
      return 'cool';
    case 'B6':
    case 'B7':
      return 'cold';
    case 'B8':
    case 'B9':
      return 'freezing';
    default:
      return 'mild';
  }
}
