import { useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/calendar';
import { useHolidayNames } from '../../features/calendar/useHolidayNames';
import { tutorialTarget } from '../shared/TutorialTour';
import { CalendarDayCell } from './CalendarDayCell';
import { CalendarPeriodHeader } from './CalendarPeriodHeader';
import type { CalendarMonthCell } from './calendarUtils';
import { useCalendarSlide } from './useCalendarSlide';
import type { CalendarDailyWeather, CalendarWeatherRiskIndicator } from './calendarWeatherRisk';

type Props = {
  dailyWeatherByDate?: Record<string, CalendarDailyWeather | undefined>;
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
  dailyWeatherByDate,
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
  const holidays = useHolidayNames(Number((monthCells.find(Boolean)?.date ?? todayDateLabel).slice(0, 4)));
  const { animatedStyle: monthAnimatedStyle, swipeHandlers } = useCalendarSlide(monthTitle, transitionDirection, onMoveMonth);
  // 한 줄 높이. 공휴일 이름(날짜 아래 top 28 + 줄 높이 13)이 다 들어가지 않으면 이름을 숨깁니다.
  const [rowHeight, setRowHeight] = useState(0);
  const hideHolidayName = rowHeight > 0 && rowHeight < 42;

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
      <Animated.View onLayout={(event) => setRowHeight(event.nativeEvent.layout.height / weekRows.length)} style={[styles.calendarGrid, monthAnimatedStyle]} {...swipeHandlers}>
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
                  cellIndex={cellIndex}
                  dailyWeather={dailyWeatherByDate?.[cell.date]}
                  date={cell.date}
                  day={cell.day}
                  eventCount={eventCountByDate[cell.date] ?? 0}
                  eventItems={eventItemsByDate[cell.date] ?? []}
                  getEventTone={getEventTone}
                  hideHolidayName={hideHolidayName}
                  holidayName={holidays[cell.date]}
                  isRangeAnchor={false}
                  isSelected={cell.date === selectedDate}
                  isToday={cell.date === todayDateLabel}
                  key={cell.date}
                  onLongPress={() => onSelectDate(cell.date)}
                  onPress={() => onSelectDate(cell.date)}
                  // 캘린더를 처음 열 때 안내 말풍선이 오늘 날짜 칸을 가리킨다(CalendarTip).
                  onRef={cell.date === todayDateLabel ? tutorialTarget('calendarToday') : undefined}
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
