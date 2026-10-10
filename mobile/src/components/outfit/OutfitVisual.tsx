import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

import type { OutfitFigure, OutfitRecommendation } from '../../types/outfit';
import { outfitStyles } from './outfitStyles';

export type OutfitVisualKey = 'sport' | 'rain' | 'snow' | 'wind' | 'heatwave' | 'hot' | 'warm' | 'mild' | 'cool' | 'cold' | 'freezing';

const OUTFIT_VISUALS: Record<OutfitFigure, Record<OutfitVisualKey, ImageSourcePropType>> = {
  male: {
    sport: require('../../../assets/outfit/outfit-running.png'),
    rain: require('../../../assets/outfit/outfit-rain.png'),
    snow: require('../../../assets/outfit/outfit-snow.png'),
    wind: require('../../../assets/outfit/outfit-wind.png'),
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
    rain: require('../../../assets/outfit/outfit-female-rain.png'),
    snow: require('../../../assets/outfit/outfit-female-snow.png'),
    wind: require('../../../assets/outfit/outfit-female-wind.png'),
    heatwave: require('../../../assets/outfit/outfit-female-heatwave.png'),
    hot: require('../../../assets/outfit/outfit-female-hot.png'),
    warm: require('../../../assets/outfit/outfit-female-warm.png'),
    mild: require('../../../assets/outfit/outfit-female-mild.png'),
    cool: require('../../../assets/outfit/outfit-female-cool.png'),
    cold: require('../../../assets/outfit/outfit-female-cold.png'),
    freezing: require('../../../assets/outfit/outfit-female-freezing.png'),
  },
};

export function resolveOutfitVisual(result: OutfitRecommendation): OutfitVisualKey {
  const weatherCondition = result.weather_condition ?? result.weather_snapshot.weather_condition;
  if (weatherCondition === 'snow') return 'snow';
  if (weatherCondition === 'rain') return 'rain';
  if (weatherCondition === 'strong_wind') return 'wind';
  if (result.must_have.some((item) => item.type === 'sun_parasol')) return 'heatwave';
  if (result.occasion === 'running' || result.occasion === 'sport') return 'sport';
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
