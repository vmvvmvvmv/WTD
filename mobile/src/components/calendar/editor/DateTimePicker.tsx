import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { CalendarDatePickerGrid } from '../CalendarDatePickerGrid';
import { styles } from '../../../styles/appStyles';
import { addMinutesToDateTime, addMinutesWithinDay, durationMinutes, endForTime, formatDuration, formatDateDisplay } from '../calendarUtils';
import { animatePickerLayout, formatMonthDay } from './pickerShared';
import { TimeWheelPicker } from './TimeWheelPicker';
import { accentTone } from '../../../theme/appTheme';

const DURATION_OPTIONS = [30, 60, 120, 180, 240];

export function DateTimePicker({
  endDate,
  endTime,
  onChangeEndDate,
  onChangeEndTime,
  onChangeStartDate,
  onChangeStartTime,
  startDate,
  startTime,
}: {
  endDate: string;
  endTime: string;
  onChangeEndDate: (value: string) => void;
  onChangeEndTime: (value: string) => void;
  onChangeStartDate: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  startDate: string;
  startTime: string;
}) {
  const [showDateWheel, setShowDateWheel] = useState(false);
  const [activeField, setActiveField] = useState<'start' | 'end'>('start');
  const [tabWidth, setTabWidth] = useState(0);
  const tabIndicator = useRef(new Animated.Value(0)).current;
  const duration = durationMinutes(startDate, startTime, endDate, endTime);

  useEffect(() => {
    Animated.spring(tabIndicator, { damping: 18, stiffness: 220, toValue: activeField === 'start' ? 0 : 1, useNativeDriver: true }).start();
  }, [activeField, tabIndicator]);

  // 시작을 옮기면 지금 일정 길이를 그대로 유지합니다(처음 만들 때는 1시간).
  const setStartDateTime = (nextDate: string, nextTime: string) => {
    onChangeStartDate(nextDate);
    onChangeStartTime(nextTime);
    const shift = endDate === startDate ? addMinutesWithinDay : addMinutesToDateTime;
    const shifted = shift(nextDate, nextTime, duration > 0 ? duration : 60);
    onChangeEndDate(shifted.date);
    onChangeEndTime(shifted.time);
  };

  const setEndTime = (nextTime: string) => {
    const next = endForTime(startDate, startTime, nextTime);
    onChangeEndDate(next.date);
    onChangeEndTime(next.time);
  };

  // 길이 칩: 시작은 그대로 두고 종료만 시작 + 고른 길이로 맞춥니다.
  const setDuration = (minutes: number) => {
    Haptics.selectionAsync().catch(() => {});
    const shifted = addMinutesToDateTime(startDate, startTime, minutes);
    onChangeEndDate(shifted.date);
    onChangeEndTime(shifted.time);
  };

  const selectField = (field: 'start' | 'end') => {
    if (field === activeField) return;
    Haptics.selectionAsync().catch(() => {});
    setActiveField(field);
  };

  const setActiveTime = (nextTime: string) => {
    if (activeField === 'end') {
      setEndTime(nextTime);
      return;
    }
    setStartDateTime(startDate, nextTime);
  };

  const endLabel = endDate === startDate ? endTime : `${formatMonthDay(endDate)} ${endTime}`;

  return (
    <View style={styles.calendarDateTimePickerGroup}>
      <View
        accessibilityRole="tablist"
        onLayout={(event) => setTabWidth(event.nativeEvent.layout.width / 2)}
        style={styles.calendarTimeRangeTabs}
      >
        {(['start', 'end'] as const).map((field) => {
          const active = activeField === field;
          return (
            <Pressable
              accessibilityLabel={`${field === 'start' ? '시작' : '종료'} 시간 ${field === 'start' ? startTime : endLabel} 고르기`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={field}
              onPress={() => selectField(field)}
              style={styles.calendarTimeRangeTab}
            >
              <Text style={[styles.calendarTimeRangeTabLabel, active && { color: accentTone }]}>{field === 'start' ? '시작' : '종료'}</Text>
              <Text style={[styles.calendarTimeRangeTabValue, active && styles.calendarTimeRangeTabValueActive]}>{field === 'start' ? startTime : endLabel}</Text>
            </Pressable>
          );
        })}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.calendarTimeRangeIndicator,
              {
                backgroundColor: accentTone,
                transform: [{ translateX: tabIndicator.interpolate({ inputRange: [0, 1], outputRange: [0, tabWidth] }) }],
                width: tabWidth,
              },
            ]}
          />
        )}
      </View>
      <View accessibilityLabel="일정 길이 선택" style={styles.calendarDurationRow}>
        {DURATION_OPTIONS.map((minutes) => {
          const active = duration === minutes;
          return (
            <Pressable
              accessibilityLabel={`${formatDuration(minutes)} 일정`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={minutes}
              onPress={() => setDuration(minutes)}
              style={({ pressed }) => [styles.calendarDurationChip, active && { backgroundColor: accentTone, borderColor: accentTone }, pressed && styles.pressedFeedback]}
            >
              <Text style={[styles.calendarDurationChipText, active && styles.calendarChipTextSelected]}>{formatDuration(minutes)}</Text>
            </Pressable>
          );
        })}
      </View>
      <TimeWheelPicker
        onChange={setActiveTime}
        value={activeField === 'start' ? startTime : endTime}
      />
      <Pressable
        accessibilityLabel="일정 날짜 선택"
        onPress={() => {
          animatePickerLayout();
          setShowDateWheel((current) => !current);
        }}
        style={({ pressed }) => [styles.calendarDateSummaryRow, pressed && styles.pressedFeedback]}
      >
        <View style={styles.calendarDateSummaryTextGroup}>
          <Text style={styles.calendarDateSummaryValue}>{formatDateDisplay(startDate)}</Text>
          <Text style={styles.calendarDateSummaryHint}>
            {startTime}~{endLabel}{duration > 0 ? ` · ${formatDuration(duration)} 일정` : ''}
          </Text>
        </View>
        <Ionicons color={accentTone} name="calendar-outline" size={22} />
      </Pressable>
      {showDateWheel && (
        <CalendarDatePickerGrid
          onChange={(date) => {
            setStartDateTime(date, startTime);
            animatePickerLayout();
            setShowDateWheel(false);
          }}
          value={startDate}
        />
      )}
    </View>
  );
}

