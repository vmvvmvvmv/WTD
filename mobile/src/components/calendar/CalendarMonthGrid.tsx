import { Ionicons } from '@expo/vector-icons';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { bauhausColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/dust';
import { CalendarDayCell } from './CalendarDayCell';
import type { CalendarWeatherRiskIndicator } from './calendarWeatherRisk';

export type CalendarMonthCell = { date: string; day: number; inMonth: boolean } | null;

type Props = {
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  eventCountByDate: Record<string, number>;
  eventItemsByDate: Record<string, Array<CalendarEvent | null>>;
  getEventTone: (event: CalendarEvent) => string;
  // 주 보기처럼 칸이 길 때 더 많은 일정 줄을 보여줍니다.
  maxEventLines?: number;
  monthCells: CalendarMonthCell[];
  monthTitle: string;
  // 이번 달이 아닐 때만 넘깁니다. 있으면 제목 옆에 "오늘" 버튼을 보여줍니다.
  onGoToday?: () => void;
  onMoveMonth: (offset: number) => void;
  onSelectDate: (date: string, options?: { openSheet?: boolean; trackTap?: boolean }) => void;
  resetSignal?: number;
  selectedDate: string;
  // 이전/다음 버튼 읽기용 단위('달' 또는 '주').
  stepUnitLabel?: string;
  todayDateLabel: string;
  transitionDirection: number;
  weatherRiskByDate?: Record<string, CalendarWeatherRiskIndicator | undefined>;
};

// 주·월·년 보기가 같이 쓰는 넘김 동작: 제목이 바뀌면 옆에서 밀려 들어오고, 좌우로 밀면 한 칸 이동합니다.
export function useCalendarSlide(title: string, direction: number, onMove: (offset: number) => void) {
  const progress = useRef(new Animated.Value(1)).current;
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // 화면을 처음 열 때는 화면 전환 애니메이션만 쓰고, 넘길 때만 밀어 넣습니다.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, { duration: 210, toValue: 1, useNativeDriver: true }).start();
  }, [progress, title]);

  const animatedStyle = {
    opacity: progress,
    transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [18 * direction, 0] }) }],
  };

  const swipeHandlers = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 18
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4
    ),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 48) return;
      onMove(gesture.dx > 0 ? -1 : 1);
    },
  }).panHandlers, [onMove]);

  return { animatedStyle, swipeHandlers };
}

const weekDays = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];

export function CalendarMonthGrid({
  accentBorderTone,
  accentSoftTone,
  accentTone,
  eventCountByDate,
  eventItemsByDate,
  getEventTone,
  maxEventLines,
  monthCells,
  monthTitle,
  onGoToday,
  onMoveMonth,
  onSelectDate,
  selectedDate,
  stepUnitLabel = '달',
  todayDateLabel,
  transitionDirection,
  weatherRiskByDate,
}: Props) {
  const weekRows = Array.from({ length: Math.max(1, Math.ceil(monthCells.length / 7)) }, (_, rowIndex) => (
    monthCells.slice(rowIndex * 7, rowIndex * 7 + 7)
  ));
  const { animatedStyle: monthAnimatedStyle, swipeHandlers } = useCalendarSlide(monthTitle, transitionDirection, onMoveMonth);
  const handleMoveMonth = onMoveMonth;

  const handlePressEmptyDay = () => {
    onSelectDate(todayDateLabel, { openSheet: false, trackTap: false });
  };

  return (
    <View style={styles.calendarMonthCard}>
      <View style={styles.calendarMonthHeader}>
        <Pressable accessibilityLabel={`\uC774\uC804 ${stepUnitLabel}`} onPress={() => handleMoveMonth(-1)} style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.pressedFeedback]}>
          <Ionicons color={bauhausColors.blue} name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.calendarMonthTitleGroup}>
          <Text style={styles.calendarMonthTitle}>{monthTitle}</Text>
          {onGoToday && (
            <Pressable
              accessibilityLabel="오늘로 이동"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onGoToday}
              style={({ pressed }) => [styles.calendarTodayButton, pressed && styles.pressedFeedback]}
            >
              <Text style={styles.calendarTodayButtonText}>오늘</Text>
            </Pressable>
          )}
        </View>
        <Pressable accessibilityLabel={`\uB2E4\uC74C ${stepUnitLabel}`} onPress={() => handleMoveMonth(1)} style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.pressedFeedback]}>
          <Ionicons color={bauhausColors.blue} name="chevron-forward" size={22} />
        </Pressable>
      </View>
      <View style={styles.calendarWeekRow}>
        {weekDays.map((day, index) => (
          <Text key={day} style={[styles.calendarWeekText, index === 0 && styles.calendarWeekTextSunday, index === 6 && styles.calendarWeekTextSaturday]}>{day}</Text>
        ))}
      </View>
      <LayoutAnimationConfig skipEntering>
      <Animated.View style={[styles.calendarGrid, monthAnimatedStyle]} {...swipeHandlers}>
        {weekRows.map((week, rowIndex) => (
          <View key={`week-${rowIndex}`} style={styles.calendarGridWeekRow}>
            {week.map((cell, columnIndex) => {
              const cellIndex = rowIndex * 7 + columnIndex;
              if (!cell) {
                return (
                  <Pressable
                    accessibilityLabel="빈 날짜"
                    key={`empty-${cellIndex}`}
                    onPress={handlePressEmptyDay}
                    style={({ pressed }) => [styles.calendarDayCell, styles.calendarBlankDayCell, styles.calendarGridDayFill, pressed && styles.pressedFeedback]}
                  />
                );
              }

              return (
                <CalendarDayCell
                  accentSoftTone={accentSoftTone}
                  accentTone={accentTone}
                  cellIndex={cellIndex}
                  date={cell.date}
                  day={cell.day}
                  eventCount={eventCountByDate[cell.date] ?? 0}
                  eventItems={eventItemsByDate[cell.date] ?? []}
                  getEventTone={getEventTone}
                  isRangeAnchor={false}
                  isSelected={cell.date === selectedDate}
                  isToday={cell.date === todayDateLabel}
                  key={cell.date}
                  maxEventLines={maxEventLines}
                  onLongPress={() => onSelectDate(cell.date)}
                  onPress={() => onSelectDate(cell.date)}
                  range={null}
                  style={styles.calendarGridDayFill}
                  weatherRisk={weatherRiskByDate?.[cell.date]}
                />
              );
            })}
          </View>
        ))}
      </Animated.View>
      </LayoutAnimationConfig>
    </View>
  );
}
