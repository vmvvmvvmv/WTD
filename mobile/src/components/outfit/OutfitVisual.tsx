import { Image, type ImageSourcePropType } from 'react-native';

import type { OutfitRecommendation } from '../../types/dust';
import { outfitStyles } from './outfitStyles';

export type OutfitVisualKey = 'running' | 'hot' | 'warm' | 'mild' | 'cool' | 'cold' | 'freezing';

const OUTFIT_VISUALS: Record<OutfitVisualKey, ImageSourcePropType> = {
  running: require('../../../assets/outfit/outfit-running.png'),
  hot: require('../../../assets/outfit/outfit-hot.png'),
  warm: require('../../../assets/outfit/outfit-warm.png'),
  mild: require('../../../assets/outfit/outfit-mild.png'),
  cool: require('../../../assets/outfit/outfit-cool.png'),
  cold: require('../../../assets/outfit/outfit-cold.png'),
  freezing: require('../../../assets/outfit/outfit-freezing.png'),
};

export function resolveOutfitVisual(result: OutfitRecommendation): OutfitVisualKey {
  if (result.occasion === 'running') return 'running';
  switch (result.outfit.band) {
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

export function OutfitVisual({ result }: { result: OutfitRecommendation }) {
  const visualKey = resolveOutfitVisual(result);
  return (
    <Image
      accessibilityLabel={`${result.outfit.band} 옷차림 이미지`}
      fadeDuration={0}
      resizeMode="contain"
      source={OUTFIT_VISUALS[visualKey]}
      style={outfitStyles.visualImage}
    />
  );
}
