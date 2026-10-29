import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tutorialTarget } from '../components/shared/TutorialTour';
import { styles } from '../styles/appStyles';
import type { TabKey } from '../types/navigation';
import { tabRoutes } from './routes';
import { accentBorderTone, accentTone } from '../theme/appTheme';

type AppTabBarProps = {
  activeTab: TabKey;
  onNavigate: (tabKey: TabKey) => void;
  onTopMeasured?: (top: number) => void;
};

export function AppTabBar({
  activeTab,
  onNavigate,
  onTopMeasured,
}: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const barRef = useRef<View>(null);
  return (
    <View
      ref={barRef}
      onLayout={() => barRef.current?.measureInWindow((_x, y) => onTopMeasured?.(y))}
      style={[styles.tabBar, { borderTopColor: accentBorderTone, paddingBottom: Math.max(8, insets.bottom) }]}
    >
      {tabRoutes.map((route) => {
        const isActive = route.key === activeTab;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onNavigate(route.key)}
            ref={route.key === 'calendar' ? tutorialTarget('tabCalendar') : undefined}
            style={({ pressed }) => [
              styles.tabItem,
              isActive && { borderTopColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Ionicons color={isActive ? accentTone : '#687180'} name={route.icon} size={19} />
            <Text style={[styles.tabText, isActive && { color: accentTone }]}>{route.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
