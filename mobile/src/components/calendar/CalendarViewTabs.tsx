import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';

type Tab<Key extends string> = { key: Key; label: string };

// 목록·일·주·월·년 탭. 밑줄이 고른 탭으로 미끄러져 갑니다.
export function CalendarViewTabs<Key extends string>({ accentTone, onChange, tabs, value }: {
  accentTone: string;
  onChange: (key: Key) => void;
  tabs: Tab<Key>[];
  value: Key;
}) {
  const reduceMotion = useReducedMotion();
  const layouts = useRef<Partial<Record<Key, { width: number; x: number }>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;
  const [isMeasured, setIsMeasured] = useState(false);

  const moveIndicator = (animated: boolean) => {
    const layout = layouts.current[value];
    if (!layout) return;
    if (!animated || reduceMotion) {
      indicatorX.setValue(layout.x);
      indicatorWidth.setValue(layout.width);
      return;
    }
    Animated.parallel([
      Animated.spring(indicatorX, { damping: 18, stiffness: 220, toValue: layout.x, useNativeDriver: false }),
      Animated.spring(indicatorWidth, { damping: 18, stiffness: 220, toValue: layout.width, useNativeDriver: false }),
    ]).start();
  };

  useEffect(() => {
    if (isMeasured) moveIndicator(true);
    // 고른 탭이 바뀔 때만 움직입니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View accessibilityRole="tablist" style={styles.calendarViewTabs}>
      {tabs.map((tab) => {
        const isActive = tab.key === value;
        return (
          <Pressable
            accessibilityLabel={`${tab.label} 단위로 보기`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            hitSlop={8}
            key={tab.key}
            onLayout={(event) => {
              const { width, x } = event.nativeEvent.layout;
              layouts.current[tab.key] = { width, x };
              if (tab.key === value) {
                moveIndicator(false);
                setIsMeasured(true);
              }
            }}
            onPress={() => onChange(tab.key)}
            style={styles.calendarViewTab}
          >
            <Text style={[styles.calendarViewTabText, isActive && { color: accentTone }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
      {isMeasured && (
        <Animated.View pointerEvents="none" style={[styles.calendarViewTabIndicator, { backgroundColor: accentTone, left: indicatorX, width: indicatorWidth }]} />
      )}
    </View>
  );
}
