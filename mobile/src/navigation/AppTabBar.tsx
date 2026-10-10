import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../styles/appStyles';
import type { TabKey } from '../types/dust';
import { tabRoutes } from './routes';
import { accentBorderTone, accentTone } from '../theme/appTheme';

type AppTabBarProps = {
  activeTab: TabKey;
  onNavigate: (tabKey: TabKey) => void;
};

export function AppTabBar({
  activeTab,
  onNavigate,
}: AppTabBarProps) {
  return (
    <View style={[styles.tabBar, { borderTopColor: accentBorderTone }]}>
      {tabRoutes.map((route) => {
        const isActive = route.key === activeTab;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onNavigate(route.key)}
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
