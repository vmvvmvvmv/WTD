import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

import type { OutfitFigure, OutfitRecommendation } from '../../types/outfit';
import { outfitStyles } from './outfitStyles';
import { resolveOutfitVisual, type OutfitVisualKey } from './resolveOutfitVisual';

const OUTFIT_VISUALS: Record<OutfitFigure, Record<OutfitVisualKey, ImageSourcePropType>> = {
  male: {
    sport: require('../../../assets/outfit/outfit-running.png'),
    sportCool: require('../../../assets/outfit/outfit-running-cool.png'),
    sportCold: require('../../../assets/outfit/outfit-running-cold.png'),
    heatwave: require('../../../assets/outfit/outfit-heatwave.png'),
    hot: require('../../../assets/outfit/outfit-hot.png'),
    warm: require('../../../assets/outfit/outfit-warm.png'),
    mild: require('../../../assets/outfit/outfit-mild.png'),
    cool: require('../../../assets/outfit/outfit-cool.png'),
    cold: require('../../../assets/outfit/outfit-cold.png'),
    freezing: require('../../../assets/outfit/outfit-freezing.png'),
  },
  female: {
    sport: require('../../../assets/outfit/outfit-female-running.png'),
    sportCool: require('../../../assets/outfit/outfit-female-running-cool.png'),
    sportCold: require('../../../assets/outfit/outfit-female-running-cold.png'),
    heatwave: require('../../../assets/outfit/outfit-female-heatwave.png'),
    hot: require('../../../assets/outfit/outfit-female-hot.png'),
    warm: require('../../../assets/outfit/outfit-female-warm.png'),
    mild: require('../../../assets/outfit/outfit-female-mild.png'),
    cool: require('../../../assets/outfit/outfit-female-cool.png'),
    cold: require('../../../assets/outfit/outfit-female-cold.png'),
    freezing: require('../../../assets/outfit/outfit-female-freezing.png'),
  },
};

export function OutfitVisual({ figure, imageStyle, result }: {
  figure: OutfitFigure;
  imageStyle?: StyleProp<ImageStyle>;
  result: OutfitRecommendation;
}) {
  const visualKey = resolveOutfitVisual(result);
  return (
    <Image
      accessibilityLabel={`${figure === 'male' ? '남성' : '여성'} ${result.outfit.band} 옷차림 이미지`}
      fadeDuration={0}
      resizeMode="contain"
      source={OUTFIT_VISUALS[figure][visualKey]}
      style={[outfitStyles.visualImage, imageStyle]}
    />
  );
}
