import { Animated, Pressable, Text, View } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/dust';
import { CalendarDayCell } from './CalendarDayCell';
import { CalendarPeriodHeader } from './CalendarPeriodHeader';
import type { CalendarMonthCell } from './calendarUtils';
import { useCalendarSlide } from './useCalendarSlide';
import type { CalendarWeatherRiskIndicator } from './calendarWeatherRisk';

type Props = {
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  eventCountByDate: Record<string, number>;
  eventItemsByDate: Record<string, Array<CalendarEvent | null>>;
  getEventTone: (event: CalendarEvent) => string;
  monthCells: CalendarMonthCell[];
  monthTitle: string;
  // 이번 달이 아닐 때만 넘깁니다. 있으면 제목 옆에 "오늘" 버튼을 보여줍니다.
  onGoToday?: () => void;
  onMoveMonth: (offset: number) => void;
  onSelectDate: (date: string, options?: { openSheet?: boolean; trackTap?: boolean }) => void;
  resetSignal?: number;
  selectedDate: string;
  todayDateLabel: string;
  transitionDirection: number;
  weatherRiskByDate?: Record<string, CalendarWeatherRiskIndicator | undefined>;
};

const weekDays = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'];

export function CalendarMonthGrid({
  accentBorderTone,
  accentSoftTone,
  accentTone,
  eventCountByDate,
  eventItemsByDate,
  getEventTone,
  monthCells,
  monthTitle,
  onGoToday,
  onMoveMonth,
  onSelectDate,
  selectedDate,
  todayDateLabel,
  transitionDirection,
  weatherRiskByDate,
}: Props) {
  const weekRows = Array.from({ length: Math.max(1, Math.ceil(monthCells.length / 7)) }, (_, rowIndex) => (
    monthCells.slice(rowIndex * 7, rowIndex * 7 + 7)
  ));
  const { animatedStyle: monthAnimatedStyle, swipeHandlers } = useCalendarSlide(monthTitle, transitionDirection, onMoveMonth);

  const handlePressEmptyDay = () => {
    onSelectDate(todayDateLabel, { openSheet: false, trackTap: false });
  };

  return (
    <View style={styles.calendarMonthCard}>
      <CalendarPeriodHeader onGoToday={onGoToday} onMove={onMoveMonth} title={monthTitle} unitLabel="달" />
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
