import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../../../styles/appStyles';
import { parseTimeParts } from '../calendarUtils';

const TIME_WHEEL_ITEM_HEIGHT = 56;

function TimeWheelColumn({ labels, onSelect, selectedIndex }: {
  labels: string[];
  onSelect: (index: number) => void;
  selectedIndex: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const hasPositionedRef = useRef(false);

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
    // 처음에는 바로 맞추고, 그 뒤(시작↔종료 전환 등)에는 새 값까지 부드럽게 굴러갑니다.
    scrollRef.current?.scrollTo({ animated: hasPositionedRef.current, y: selectedIndex * TIME_WHEEL_ITEM_HEIGHT });
    hasPositionedRef.current = true;
  }, [selectedIndex]);

  const indexFromOffset = (offsetY: number) => (
    Math.max(0, Math.min(labels.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT)))
  );

  const highlightFromOffset = (offsetY: number) => {
    const index = indexFromOffset(offsetY);
    setHighlightedIndex((current) => current === index ? current : index);
  };

  const selectFromOffset = (offsetY: number) => {
    const index = indexFromOffset(offsetY);
    setHighlightedIndex(index);
    onSelect(index);
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.calendarTimeWheelColumnContent}
      decelerationRate="fast"
      nestedScrollEnabled
      onScroll={(event) => highlightFromOffset(event.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(event) => selectFromOffset(event.nativeEvent.contentOffset.y)}
      onMomentumScrollEnd={(event) => selectFromOffset(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
      style={styles.calendarTimeWheelColumn}
    >
      {labels.map((label, index) => (
        <Pressable
          key={label}
          onPress={() => {
            setHighlightedIndex(index);
            scrollRef.current?.scrollTo({ animated: true, y: index * TIME_WHEEL_ITEM_HEIGHT });
            onSelect(index);
          }}
          style={styles.calendarTimeWheelItem}
        >
          <Text style={[styles.calendarTimeWheelItemText, index === highlightedIndex && styles.calendarTimeWheelItemTextSelected]}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function TimeWheelPicker({ accentSoftTone, accentTone, onChange, value }: {
  accentSoftTone: string;
  accentTone: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const parts = parseTimeParts(value);
  const hour24 = Number(parts.hour);
  const minute = Number(parts.minute);
  const isPm = hour24 >= 12;
  const selectedHour = hour24 % 12 || 12;
  const periods = ['오전', '오후'];
  const hours = Array.from({ length: 12 }, (_, index) => `${index + 1}시`);
  const minutes = Array.from({ length: 60 }, (_, index) => `${String(index).padStart(2, '0')}분`);

  const updateTime = (nextHour: number, nextMinute: number, pm: boolean) => {
    const nextHour24 = (nextHour % 12) + (pm ? 12 : 0);
    onChange(`${String(nextHour24).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  };

  return (
    <View accessibilityLabel={`선택한 일정 시간 ${value}`} style={styles.calendarTimeWheelSection}>
      <View style={styles.calendarTimeWheelViewport}>
        <View pointerEvents="none" style={[styles.calendarTimeWheelSelection, { borderColor: accentTone }]} />
        <TimeWheelColumn labels={periods} onSelect={(index) => updateTime(selectedHour, minute, index === 1)} selectedIndex={isPm ? 1 : 0} />
        <TimeWheelColumn labels={hours} onSelect={(index) => updateTime(index + 1, minute, isPm)} selectedIndex={selectedHour - 1} />
        <TimeWheelColumn labels={minutes} onSelect={(index) => updateTime(selectedHour, index, isPm)} selectedIndex={minute} />
        <View pointerEvents="none" style={styles.calendarTimeWheelFadeTop} />
        <View pointerEvents="none" style={styles.calendarTimeWheelFadeBottom} />
      </View>
    </View>
  );
}

