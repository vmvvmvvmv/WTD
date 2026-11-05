import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tutorialTarget } from '../components/shared/TutorialTour';
import { styles } from '../styles/appStyles';
import type { TabKey } from '../types/navigation';
import { tabRoutes } from './routes';
import { accentBorderTone, accentTone } from '../theme/appTheme';
import { bauhausColors } from '../theme/bauhaus';

// 가운데 캘린더 동그라미가 막대 위로 솟는 높이(appStyles의 tabBarSurface top·tabItem marginTop과 같음).
const CALENDAR_RAISE = 24;

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
      // 솟은 부분만큼 화면 위로 겹쳐 올려, 동그라미 양옆으로 화면 내용이 그대로 보이고 눌리게 합니다(box-none).
      // 화면에는 흰 막대 윗선을 탭 막대 위치로 알려 줍니다.
      onLayout={() => barRef.current?.measureInWindow((_x, y) => onTopMeasured?.(y + CALENDAR_RAISE))}
      pointerEvents="box-none"
      style={[styles.tabBar, { marginTop: -CALENDAR_RAISE, paddingBottom: Math.max(8, insets.bottom) }]}
    >
      <View pointerEvents="none" style={[styles.tabBarSurface, { borderTopColor: accentBorderTone }]} />
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
              route.key === 'calendar' && styles.calendarTabItem,
              route.key !== 'calendar' && isActive && { borderTopColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            {route.key === 'calendar' ? (
              // 선택됐을 때만 파랗게 채워, 지금 어느 탭인지 다른 탭과 같은 방식으로 보이게 합니다.
              <View style={[styles.calendarTabCircle, !isActive && styles.calendarTabCircleIdle]}>
                <Ionicons color={isActive ? bauhausColors.white : accentTone} name={route.icon} size={25} />
              </View>
            ) : (
              <Ionicons color={isActive ? accentTone : '#687180'} name={route.icon} size={19} />
            )}
            <Text style={[styles.tabText, isActive && { color: accentTone }]}>
              {route.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
