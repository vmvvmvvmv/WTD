import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { AppActionIcon } from '../shared/AppActionIcon';
import { semanticColors } from '../../theme/semanticColors';
import { outfitStyles } from './outfitStyles';

export function OutfitIcon({ activityType, size = 30, source = 'svg' }: {
  activityType: 'outdoor' | 'indoor' | 'transit';
  size?: number;
  source?: 'svg' | 'lottie';
}) {
  // TODO(확인 필요: 디자인 에셋): source=lottie용 최종 의상 에셋이 전달되면 이 슬롯에서 교체한다.
  const name = activityType === 'indoor' ? 'activityIndoor' : activityType === 'transit' ? 'activityTransit' : 'activityOutdoor';
  return <AppActionIcon name={name} size={size} />;
}

export function MustHaveIcon({ type }: { type: string }) {
  const icon = type === 'umbrella'
    ? 'umbrella-outline'
    : type === 'sun_parasol'
      ? 'sunny-outline'
    : type === 'mask'
      ? 'shield-checkmark-outline'
      : type === 'windbreaker'
        ? 'flag-outline'
        : type === 'waterproof_shoes'
          ? 'footsteps-outline'
          : 'snow-outline';
  return <View style={outfitStyles.mustIcon}><Ionicons color={semanticColors.outfit.accent} name={icon} size={14} /></View>;
}
