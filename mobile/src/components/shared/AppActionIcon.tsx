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
  outfit: require('../../../assets/icons/action-outfit.png'),
  schedule: require('../../../assets/icons/action-schedule.png'),
  search: require('../../../assets/icons/action-search.png'),
} as const;

// Visible artwork bounds in the 256px PNG canvas (alpha > 32).
// Re-measure these bounds when replacing an asset; transparent padding is not icon size.
const artworkBounds = {
  activityIndoor: [63, 85, 185, 206],
  activityOutdoor: [68, 24, 195, 218],
  activityTransit: [66, 73, 201, 191],
  edit: [46, 40, 202, 217],
  delete: [50, 42, 206, 212],
  favorite: [41, 39, 215, 204],
  location: [54, 40, 202, 220],
  map: [38, 58, 214, 203],
  notification: [58, 46, 199, 221],
  outfit: [43, 38, 213, 213],
  schedule: [43, 40, 217, 216],
  search: [48, 45, 215, 218],
} as const satisfies Record<keyof typeof actionIconSources, readonly [number, number, number, number]>;

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
  const [left, top, right, bottom] = artworkBounds[name];
  const scale = (256 * 0.94) / Math.max(right - left, bottom - top);
  const translateX = ((128 - (left + right) / 2) / 256) * size * scale;
  const translateY = ((128 - (top + bottom) / 2) / 256) * size * scale;

  return (
    <Image
      accessibilityIgnoresInvertColors
      fadeDuration={0}
      resizeMode="contain"
      source={actionIconSources[name]}
      style={[{ flexShrink: 0, height: size, transform: [{ translateX }, { translateY }, { scale }], width: size }, style]}
    />
  );
}
