import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Reanimated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { useHolidayNames } from '../../features/calendar/useHolidayNames';
import { styles } from '../../styles/appStyles';
import { buildMonthCells, formatDate, monthLabel, parseDateParts, weekdayLabels } from './calendarUtils';
import { accentSoftTone, accentTone } from '../../theme/appTheme';

// 일정 편집에서 날짜를 고르는 작은 달력입니다. 고른 날은 강조색 원, 오늘은 강조색 글자로 보여줍니다.
export function CalendarDatePickerGrid({ onChange, value }: {
  onChange: (date: string) => void;
  value: string;
}) {
  const selected = parseDateParts(value);
  const [visible, setVisible] = useState({ month: selected.month, year: selected.year });
  const holidays = useHolidayNames(visible.year);
  const cells = buildMonthCells(visible.year, visible.month);
  const now = new Date();
  const today = formatDate(now.getFullYear(), now.getMonth(), now.getDate());

  const moveMonth = (offset: number) => {
    const next = new Date(visible.year, visible.month + offset, 1);
    setVisible({ month: next.getMonth(), year: next.getFullYear() });
  };

  return (
    <View style={styles.calendarDatePicker}>
      <View style={styles.calendarDatePickerHeader}>
        <Pressable accessibilityLabel="이전 달" hitSlop={8} onPress={() => moveMonth(-1)} style={({ pressed }) => [styles.calendarDatePickerNav, pressed && styles.pressedFeedback]}>
          <Ionicons color={accentTone} name="chevron-back" size={20} />
        </Pressable>
        <Text style={styles.calendarDatePickerTitle}>{monthLabel(visible.year, visible.month)}</Text>
        <Pressable accessibilityLabel="다음 달" hitSlop={8} onPress={() => moveMonth(1)} style={({ pressed }) => [styles.calendarDatePickerNav, pressed && styles.pressedFeedback]}>
          <Ionicons color={accentTone} name="chevron-forward" size={20} />
        </Pressable>
      </View>
      <View style={styles.calendarDatePickerWeekRow}>
        {weekdayLabels.map((label, index) => (
          <Text key={label} style={[styles.calendarDatePickerWeekText, index === 0 && styles.calendarDatePickerSunday, index === 6 && styles.calendarDatePickerSaturday]}>{label}</Text>
        ))}
      </View>
      <Reanimated.View
        entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
        key={`${visible.year}-${visible.month}`}
        style={styles.calendarDatePickerGrid}
      >
        {cells.map((cell, index) => {
          if (!cell) return <View key={`empty-${index}`} style={styles.calendarDatePickerCell} />;
          const isSelected = cell.date === value;
          const isToday = cell.date === today;
          return (
            <Pressable
              accessibilityLabel={`${cell.date}${holidays[cell.date] ? `, ${holidays[cell.date]}` : ''}${isToday ? ', 오늘' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={cell.date}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(cell.date);
              }}
              style={styles.calendarDatePickerCell}
            >
              <View style={[styles.calendarDatePickerDay, isSelected ? { backgroundColor: accentTone } : isToday && { backgroundColor: accentSoftTone }]}>
                <Text
                  style={[
                    styles.calendarDatePickerDayText,
                    index % 7 === 6 && styles.calendarDatePickerSaturday,
                    (index % 7 === 0 || !!holidays[cell.date]) && styles.calendarDatePickerSunday,
                    isToday && { color: accentTone },
                    isSelected && styles.calendarDatePickerDayTextSelected,
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </Reanimated.View>
    </View>
  );
}
