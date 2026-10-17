import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { AppActionIcon } from '../shared/AppActionIcon';
import { semanticColors } from '../../theme/semanticColors';
import { outfitStyles } from './outfitStyles';

export function OutfitIcon({ activityType, size = 30 }: {
  activityType: 'outdoor' | 'indoor' | 'transit';
  size?: number;
}) {
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
