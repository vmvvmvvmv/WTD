import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { accentTone } from '../../theme/appTheme';

type Tab<Key extends string> = { key: Key; label: string };

// 목록·일·주·월·년 탭. 밑줄이 고른 탭으로 미끄러져 갑니다.
// 누른 채로 좌우로 밀면 손가락 아래 탭으로 바로바로 바뀝니다(바뀔 때마다 가벼운 진동).
export function CalendarViewTabs<Key extends string>({ onChange, tabs, value }: {
  onChange: (key: Key) => void;
  tabs: Tab<Key>[];
  value: Key;
}) {
  const reduceMotion = useReducedMotion();
  const layouts = useRef<Partial<Record<Key, { width: number; x: number }>>>({});
  // 밑줄 위치·폭은 화면 스레드(Reanimated)에서 움직여, 탭을 바꿀 때 화면을 다시 그리는 JS 작업과 겹쳐도 끊기지 않게 합니다.
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorStyle = useAnimatedStyle(() => ({ left: indicatorX.value, width: indicatorWidth.value }));
  const [isMeasured, setIsMeasured] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const rowRef = useRef<View>(null);
  const rowPageX = useRef(0);
  const currentKey = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { currentKey.current = value; }, [value]);

  const dragHandlers = useMemo(() => {
    // 손가락에 가장 가까운 탭(가운데 기준).
    const keyAt = (pageX: number) => {
      const x = pageX - rowPageX.current;
      let nearest = currentKey.current;
      let nearestDistance = Infinity;
      tabs.forEach((tab) => {
        const layout = layouts.current[tab.key];
        if (!layout) return;
        const distance = Math.abs(layout.x + layout.width / 2 - x);
        if (distance < nearestDistance) {
          nearest = tab.key;
          nearestDistance = distance;
        }
      });
      return nearest;
    };
    const selectAt = (pageX: number) => {
      const key = keyAt(pageX);
      if (key === currentKey.current) return;
      currentKey.current = key;
      Haptics.selectionAsync().catch(() => {});
      onChangeRef.current(key);
    };
    return PanResponder.create({
      // 그냥 누르면 탭(Pressable)이 받고, 옆으로 조금이라도 밀면 줄 전체가 받아 끌기로 바꿉니다.
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 6,
      onPanResponderGrant: (_, gesture) => {
        setIsDragging(true);
        selectAt(gesture.moveX || gesture.x0);
      },
      onPanResponderMove: (_, gesture) => selectAt(gesture.moveX),
      onPanResponderRelease: () => setIsDragging(false),
      onPanResponderTerminate: () => setIsDragging(false),
      onPanResponderTerminationRequest: () => false,
    }).panHandlers;
  }, [tabs]);

  const moveIndicator = (animated: boolean) => {
    const layout = layouts.current[value];
    if (!layout) return;
    if (!animated || reduceMotion) {
      indicatorX.value = layout.x;
      indicatorWidth.value = layout.width;
      return;
    }
    indicatorX.value = withSpring(layout.x, { damping: 18, stiffness: 220 });
    indicatorWidth.value = withSpring(layout.width, { damping: 18, stiffness: 220 });
  };

  useEffect(() => {
    if (isMeasured) moveIndicator(true);
    // 고른 탭이 바뀔 때만 움직입니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={() => rowRef.current?.measureInWindow((x) => { rowPageX.current = x; })}
      ref={rowRef}
      style={styles.calendarViewTabs}
      {...dragHandlers}
    >
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
            <Text style={[styles.calendarViewTabText, isActive && { color: accentTone }, isActive && isDragging && styles.calendarViewTabTextDragging]}>{tab.label}</Text>
          </Pressable>
        );
      })}
      {isMeasured && (
        <Reanimated.View pointerEvents="none" style={[styles.calendarViewTabIndicator, { backgroundColor: accentTone }, indicatorStyle, isDragging && styles.calendarViewTabIndicatorDragging]} />
      )}
    </View>
  );
}
