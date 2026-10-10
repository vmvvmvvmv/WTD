import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';

import { styles } from '../../../styles/appStyles';
import { formatDateDisplay, parseDateParts, stepDatePart, weekdayLabels } from '../calendarUtils';
import type { CalendarRepeatMode } from '../calendarRepeat';
import { animatePickerLayout, formatMonthDay, pickerUnits } from './pickerShared';
import type { DateTimeUnit } from './pickerShared';

const repeatOptions: Array<{ label: string; value: CalendarRepeatMode }> = [
  { label: '안 함', value: 'none' },
  { label: '매년', value: 'yearly' },
  { label: '매월', value: 'monthly' },
  { label: '매주', value: 'weekly' },
  { label: '매일', value: 'daily' },
];

function buildDragHandlers(onStep: (direction: 1 | -1) => void) {
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -8) onStep(1);
      if (gesture.dy > 8) onStep(-1);
    },
  }).panHandlers;
}

function formatWheelDay(date: string) {
  const parts = parseDateParts(date);
  const day = new Date(parts.year, parts.month, parts.day).getDay();
  return `${parts.day}일 ${weekdayLabels[day]}`;
}

function formatMonthFixedDay(date: string) {
  return `${parseDateParts(date).day}일`;
}

function stepRepeatEndDate(value: string, unit: DateTimeUnit, direction: 1 | -1) {
  if (unit === 'hour' || unit === 'minute') return value;
  return stepDatePart(value, unit, direction);
}

function RepeatDatePicker({
  accentSoftTone,
  accentTone,
  onChangeRepeatEndDate,
  repeatEndDate,
}: {
  accentSoftTone: string;
  accentTone: string;
  onChangeRepeatEndDate: (value: string) => void;
  repeatEndDate: string;
}) {
  const dateUnits = pickerUnits.filter((unit) => unit.key !== 'hour' && unit.key !== 'minute');
  const parts = parseDateParts(repeatEndDate);
  const values: Record<'year' | 'month' | 'day', string> = {
    day: formatWheelDay(repeatEndDate),
    month: `${parts.month + 1}월`,
    year: String(parts.year),
  };

  return (
    <View style={styles.calendarRepeatDateWheel}>
      <View style={[styles.calendarDateWheelHighlight, { backgroundColor: accentSoftTone }]} />
      {dateUnits.map((unit) => {
        const dragHandlers = buildDragHandlers((direction) => onChangeRepeatEndDate(stepRepeatEndDate(repeatEndDate, unit.key, direction)));
        return (
          <View key={unit.key} style={styles.calendarDateWheelColumn}>
            <Pressable onPress={() => onChangeRepeatEndDate(stepRepeatEndDate(repeatEndDate, unit.key, 1))} style={({ pressed }) => [styles.calendarDateWheelStep, pressed && styles.pressedFeedback]}>
              <Ionicons color={accentTone} name="chevron-up" size={16} />
            </Pressable>
            <Pressable
              onPress={() => onChangeRepeatEndDate(stepRepeatEndDate(repeatEndDate, unit.key, 1))}
              style={({ pressed }) => [styles.calendarDateWheelValue, pressed && styles.pressedFeedback]}
              {...dragHandlers}
            >
              <Text style={styles.calendarDateWheelLabel}>{unit.label}</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.calendarDateWheelText}>{values[unit.key]}</Text>
            </Pressable>
            <Pressable onPress={() => onChangeRepeatEndDate(stepRepeatEndDate(repeatEndDate, unit.key, -1))} style={({ pressed }) => [styles.calendarDateWheelStep, pressed && styles.pressedFeedback]}>
              <Ionicons color={accentTone} name="chevron-down" size={16} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function RepeatSelector({
  accentSoftTone,
  accentTone,
  onChangeRepeatEndDate,
  onChangeRepeatMode,
  onChangeRepeatWeekdays,
  repeatEndDate,
  repeatMode,
  repeatWeekdays,
  startDate,
}: {
  accentSoftTone: string;
  accentTone: string;
  onChangeRepeatEndDate: (value: string) => void;
  onChangeRepeatMode: (value: CalendarRepeatMode) => void;
  onChangeRepeatWeekdays: (value: number[]) => void;
  repeatEndDate: string;
  repeatMode: CalendarRepeatMode;
  repeatWeekdays: number[];
  startDate: string;
}) {
  const [isRepeatDatePickerOpen, setIsRepeatDatePickerOpen] = useState(false);

  const toggleWeekday = (day: number) => {
    const next = repeatWeekdays.includes(day)
      ? repeatWeekdays.filter((item) => item !== day)
      : [...repeatWeekdays, day].sort((a, b) => a - b);
    onChangeRepeatWeekdays(next.length > 0 ? next : [day]);
  };

  const selectRepeatMode = (mode: CalendarRepeatMode) => {
    animatePickerLayout();
    onChangeRepeatMode(mode);
    setIsRepeatDatePickerOpen(false);
  };

  return (
    <View style={styles.calendarRepeatBlock}>
      <View style={styles.calendarRepeatOptionGrid}>
        {repeatOptions.map((option) => {
          const active = repeatMode === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => selectRepeatMode(option.value)}
              style={({ pressed }) => [
                styles.calendarRepeatOption,
                active && { backgroundColor: accentTone, borderColor: accentTone },
                pressed && styles.pressedFeedback,
              ]}
            >
              <Text style={[styles.calendarRepeatOptionText, active && styles.calendarChipTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {repeatMode === 'yearly' && <Text style={styles.calendarRepeatHint}>매년 {formatMonthDay(startDate)}에 반복</Text>}
      {repeatMode === 'monthly' && <Text style={styles.calendarRepeatHint}>매월 {formatMonthFixedDay(startDate)}에 반복</Text>}

      {repeatMode === 'weekly' && (
        <View style={styles.calendarWeekdayPicker}>
          {weekdayLabels.map((label, index) => {
            const active = repeatWeekdays.includes(index);
            return (
              <Pressable
                key={`${label}-${index}`}
                onPress={() => toggleWeekday(index)}
                style={({ pressed }) => [
                  styles.calendarWeekdayChip,
                  active && { backgroundColor: accentTone, borderColor: accentTone },
                  pressed && styles.pressedFeedback,
                ]}
              >
                <Text style={[styles.calendarWeekdayChipText, active && styles.calendarChipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {(repeatMode === 'weekly' || repeatMode === 'daily') && (
        <>
          <Pressable
            onPress={() => {
              animatePickerLayout();
              setIsRepeatDatePickerOpen((current) => !current);
            }}
            style={({ pressed }) => [styles.calendarRepeatEndButton, pressed && styles.pressedFeedback]}
          >
            <Text style={styles.calendarRepeatEndLabel}>반복 종료일</Text>
            <Text style={[styles.calendarRepeatEndValue, { color: accentTone }]}>{formatDateDisplay(repeatEndDate)}</Text>
          </Pressable>
          {isRepeatDatePickerOpen && (
            <RepeatDatePicker
              accentSoftTone={accentSoftTone}
              accentTone={accentTone}
              onChangeRepeatEndDate={onChangeRepeatEndDate}
              repeatEndDate={repeatEndDate}
            />
          )}
        </>
      )}
    </View>
  );
}

