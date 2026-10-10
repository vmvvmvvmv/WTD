import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import { bauhausColors } from '../../theme/bauhaus';
import { useCalendarSlide } from './CalendarMonthGrid';
import { buildMonthCells } from './calendarUtils';

type Props = {
  accentSoftTone: string;
  accentTone: string;
  eventDates: Set<string>;
  onGoToday?: () => void;
  onMoveYear: (offset: number) => void;
  onSelectMonth: (month: number) => void;
  todayDateLabel: string;
  transitionDirection: number;
  year: number;
};

// 1년 12달을 한눈에. 달을 누르면 그 달 보기로 갑니다. 일정 있는 날은 점으로 표시합니다.
export function CalendarYearGrid({ accentSoftTone, accentTone, eventDates, onGoToday, onMoveYear, onSelectMonth, todayDateLabel, transitionDirection, year }: Props) {
  const todayMonthKey = todayDateLabel.slice(0, 7);
  const { animatedStyle, swipeHandlers } = useCalendarSlide(String(year), transitionDirection, onMoveYear);

  return (
    <View style={styles.calendarMonthCard}>
      <View style={styles.calendarMonthHeader}>
        <Pressable accessibilityLabel="이전 해" onPress={() => onMoveYear(-1)} style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.pressedFeedback]}>
          <Ionicons color={bauhausColors.blue} name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.calendarMonthTitleGroup}>
          <Text style={styles.calendarMonthTitle}>{year}년</Text>
          {onGoToday && (
            <Pressable accessibilityLabel="오늘로 이동" accessibilityRole="button" hitSlop={8} onPress={onGoToday} style={({ pressed }) => [styles.calendarTodayButton, pressed && styles.pressedFeedback]}>
              <Text style={styles.calendarTodayButtonText}>오늘</Text>
            </Pressable>
          )}
        </View>
        <Pressable accessibilityLabel="다음 해" onPress={() => onMoveYear(1)} style={({ pressed }) => [styles.calendarMonthButton, pressed && styles.pressedFeedback]}>
          <Ionicons color={bauhausColors.blue} name="chevron-forward" size={22} />
        </Pressable>
      </View>
      {/* 월·주 보기와 같은 칸(흰 바탕·가는 선). 3달씩 4줄. */}
      <Animated.View style={[styles.calendarGrid, styles.calendarYearGrid, animatedStyle]} {...swipeHandlers}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.calendarGridWeekRow}>
            {[0, 1, 2].map((column) => {
              const month = row * 3 + column;
              const isTodayMonth = `${year}-${String(month + 1).padStart(2, '0')}` === todayMonthKey;
              return (
                <Pressable
                  accessibilityLabel={`${month + 1}월 보기`}
                  key={month}
                  onPress={() => onSelectMonth(month)}
                  style={({ pressed }) => [
                    styles.calendarDayCell,
                    styles.calendarYearMonth,
                    isTodayMonth && { backgroundColor: accentSoftTone },
                    pressed && styles.pressedFeedback,
                  ]}
                >
                  <Text style={[styles.calendarDayText, styles.calendarYearMonthTitle, isTodayMonth && { color: accentTone }]}>{month + 1}월</Text>
                  <View style={styles.calendarYearDays}>
                    {buildMonthCells(year, month).map((cell, index) => (
                      <View key={index} style={styles.calendarYearDay}>
                        {cell && (
                          <Text style={[
                            styles.calendarYearDayText,
                            index % 7 === 0 && styles.calendarWeekTextSunday,
                            index % 7 === 6 && styles.calendarWeekTextSaturday,
                            cell.date === todayDateLabel && { color: accentTone, fontWeight: '900' },
                          ]}>{cell.day}</Text>
                        )}
                        {cell && eventDates.has(cell.date) && <View style={[styles.calendarYearDot, { backgroundColor: accentTone }]} />}
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
