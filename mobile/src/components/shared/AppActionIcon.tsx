import { Image, type ImageStyle, type StyleProp } from 'react-native';

const actionIconSources = {
  activityIndoor: require('../../../assets/icons/activity-indoor.png'),
  activityOutdoor: require('../../../assets/icons/activity-outdoor.png'),
  activityTransit: require('../../../assets/icons/activity-transit.png'),
  edit: require('../../../assets/icons/action-edit.png'),
  delete: require('../../../assets/icons/action-delete.png'),
  favorite: require('../../../assets/icons/action-favorite.png'),
  location: require('../../../assets/icons/action-location.png'),
  map: require('../../../assets/icons/action-map.png'),
  notification: require('../../../assets/icons/action-notification.png'),
  schedule: require('../../../assets/icons/action-schedule.png'),
  search: require('../../../assets/icons/action-search.png'),
} as const;

const ICON_VISUAL_SCALE = 1.18;

export type AppActionIconName = keyof typeof actionIconSources;

export function AppActionIcon({
  name,
  size = 24,
  style,
}: {
  name: AppActionIconName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      fadeDuration={0}
      resizeMode="contain"
      source={actionIconSources[name]}
      style={[{ flexShrink: 0, height: size, transform: [{ scale: ICON_VISUAL_SCALE }], width: size }, style]}
    />
  );
}
