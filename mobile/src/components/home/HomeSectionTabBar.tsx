import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { tutorialTarget } from '../shared/TutorialTour';

export type HomeSectionKey = 'guide' | 'outfit' | 'map';

// 탭을 고른 순간 아이콘이 한 번만 살짝 튀어 오릅니다. 계속 움직이는 건 홈 배너 하나로 둡니다.
function HomeTabSelectedIcon({ animate, name, size }: { animate: boolean; name: AppActionIconName; size: number }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    const animation = Animated.spring(progress, { damping: 9, stiffness: 220, toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [animate, progress]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
        ],
      }}
    >
      <AppActionIcon name={name} size={size} />
    </Animated.View>
  );
}

// 활동 가이드·옷차림·날씨 지도 탭 줄. 고른 탭 밑줄이 미끄러져 옮겨 갑니다.
export function HomeSectionTabBar({
  activeIndex,
  activeKey,
  animateIcon,
  onSelect,
  reduceMotion,
  tabs,
}: {
  activeIndex: number;
  activeKey: HomeSectionKey;
  animateIcon: boolean;
  onSelect: (key: HomeSectionKey, index: number) => void;
  reduceMotion: boolean;
  tabs: { icon: AppActionIconName; key: HomeSectionKey; label: string }[];
}) {
  const [sectionTabRowWidth, setSectionTabRowWidth] = useState(0);
  const sectionTabWidth = tabs.length > 0 ? sectionTabRowWidth / tabs.length : 0;
  const sectionIndicatorX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const x = activeIndex * sectionTabWidth;
    if (reduceMotion) sectionIndicatorX.setValue(x);
    else Animated.timing(sectionIndicatorX, { duration: 250, easing: Easing.out(Easing.cubic), toValue: x, useNativeDriver: true }).start();
  }, [activeIndex, reduceMotion, sectionIndicatorX, sectionTabWidth]);
  return (
    <View accessibilityRole="tablist" onLayout={(event) => setSectionTabRowWidth(event.nativeEvent.layout.width)} ref={tutorialTarget('homeSections')} style={styles.homeSectionTabRow}>
      {tabs.map((tab, index) => {
        const selected = tab.key === activeKey;
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onSelect(tab.key, index)}
            style={({ pressed }) => [styles.homeSectionTab, pressed && styles.pressedFeedback]}
          >
            {selected
              ? <HomeTabSelectedIcon animate={animateIcon} name={tab.icon} size={24} />
              : <AppActionIcon name={tab.icon} size={24} style={styles.homeSectionTabIconMuted} />}
            <View style={styles.homeSectionTabLabelRow}>
              <Text style={[styles.homeSectionTabText, selected && styles.homeSectionTabTextSelected]}>{tab.label}</Text>
            </View>
          </Pressable>
        );
      })}
      {sectionTabWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.homeSectionTabIndicator, { backgroundColor: accentTone, transform: [{ translateX: sectionIndicatorX }], width: sectionTabWidth }]}
        />
      )}
    </View>
  );
}
