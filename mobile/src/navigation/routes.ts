import { Ionicons } from '@expo/vector-icons';

import type { TabKey } from '../types/dust';

export type TabRoute = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

// Keep navigation metadata in one place. Detail views are opened from a tab and
// are intentionally not duplicated as bottom-tab items.
export const tabRoutes: readonly TabRoute[] = [
  { key: 'home', label: '\uD648', icon: 'home' },
  { key: 'calendar', label: '\uCE98\uB9B0\uB354', icon: 'calendar' },
  { key: 'account', label: '\uC124\uC815', icon: 'settings' },
];
