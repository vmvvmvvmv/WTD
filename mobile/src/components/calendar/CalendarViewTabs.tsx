import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';

type Tab<Key extends string> = { key: Key; label: string };

// 목록·일·주·월·년 탭. 밑줄이 고른 탭으로 미끄러져 갑니다.
// 누른 채로 좌우로 밀면 손가락 아래 탭으로 바로바로 바뀝니다(바뀔 때마다 가벼운 진동).
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
        <Animated.View pointerEvents="none" style={[styles.calendarViewTabIndicator, { backgroundColor: accentTone, left: indicatorX, width: indicatorWidth }, isDragging && styles.calendarViewTabIndicatorDragging]} />
      )}
    </View>
  );
}
