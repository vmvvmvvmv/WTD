import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import { searchNaverPlaces } from '../../api/dustEndpoints';
import { AppActionIcon, type AppActionIconName } from '../shared/AppActionIcon';
import { CalendarDatePickerGrid } from './CalendarDatePickerGrid';
import { styles } from '../../styles/appStyles';
import { textColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/dust';
import {
  addMinutesToDateTime,
  compareDateTime,
  durationMinutes,
  endForTime,
  formatDuration,
  formatDateDisplay,
  formatDate,
  parseDateParts,
  parseTimeParts,
  stepDatePart,
  weekdayLabels,
} from './calendarUtils';
import type { CalendarRepeatMode } from './calendarRepeat';
import type { CalendarLocationCandidate } from './calendarLocation';

const pickerUnits = [
  { key: 'year', label: '년' },
  { key: 'month', label: '월' },
  { key: 'day', label: '일' },
  { key: 'hour', label: '시' },
  { key: 'minute', label: '분' },
] as const;


const repeatOptions: Array<{ label: string; value: CalendarRepeatMode }> = [
  { label: '안 함', value: 'none' },
  { label: '매년', value: 'yearly' },
  { label: '매월', value: 'monthly' },
  { label: '매주', value: 'weekly' },
  { label: '매일', value: 'daily' },
];

type DateTimeUnit = typeof pickerUnits[number]['key'];
export type CalendarActivityInput = CalendarEvent['activityType'];

const activityOptions: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: CalendarActivityInput }> = [
  { icon: 'home-outline', label: '실내', value: 'indoor' },
  { icon: 'walk-outline', label: '실외', value: 'outdoor' },
];

const defaultActivityGuides: Record<CalendarActivityInput, { desc: string; icon: AppActionIconName; title: string }> = {
  indoor: {
    desc: '실내 일정이라도 가는 길의 공기는 확인해 보세요.',
    icon: 'activityIndoor',
    title: '실내 활동 가이드',
  },
  outdoor: {
    desc: '나가기 전에 비, 기온, 미세먼지를 확인해 보세요.',
    icon: 'activityOutdoor',
    title: '실외 활동 가이드',
  },
  transit: {
    desc: '출발할 때 날씨와 공기 상태를 확인해 보세요.',
    icon: 'activityTransit',
    title: '이동 활동 가이드',
  },
};

const notificationLeadOptions: Array<{ label: string; value: number | null }> = [
  { label: '\uC5C6\uC74C', value: null },
  { label: '30\uBD84 \uC804', value: 0.5 },
  { label: '1\uC2DC\uAC04 \uC804', value: 1 },
  { label: '3\uC2DC\uAC04 \uC804', value: 3 },
];

type Props = {
  accentSoftTone: string;
  accentTone: string;
  activityInput: CalendarActivityInput;
  endDate: string;
  endTime: string;
  isRepeatLocked?: boolean;
  isOpen: boolean;
  location: string;
  mapPickerUrl?: string;
  memo: string;
  onChangeEndDate: (value: string) => void;
  onChangeEndTime: (value: string) => void;
  onChangeLocation: (value: string) => void;
  onChangeNotificationHoursBefore: (value: number | null) => void;
  onChangeSelectedLocation?: (value: CalendarLocationCandidate | null) => void;
  onChangeMemo: (value: string) => void;
  onChangeActivityInput: (value: CalendarActivityInput) => void;
  onChangeRepeatEndDate: (value: string) => void;
  onChangeRepeatMode: (value: CalendarRepeatMode) => void;
  onChangeRepeatWeekdays: (value: number[]) => void;
  onChangeStartDate: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  repeatEndDate: string;
  repeatMode: CalendarRepeatMode;
  repeatWeekdays: number[];
  notificationHoursBefore?: number | null;
  selectedLocation?: CalendarLocationCandidate | null;
  startDate: string;
  startTime: string;
  title: string;
};

const DURATION_OPTIONS = [30, 60, 120, 180, 240];

function animatePickerLayout() {
  LayoutAnimation.configureNext({
    create: { duration: 180, property: LayoutAnimation.Properties.opacity, type: LayoutAnimation.Types.easeInEaseOut },
    delete: { duration: 130, property: LayoutAnimation.Properties.opacity, type: LayoutAnimation.Types.easeInEaseOut },
    duration: 180,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

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

function formatMonthDay(date: string) {
  const parts = parseDateParts(date);
  return `${parts.month + 1}월 ${parts.day}일`;
}

function formatMonthFixedDay(date: string) {
  return `${parseDateParts(date).day}일`;
}

function stepRepeatEndDate(value: string, unit: DateTimeUnit, direction: 1 | -1) {
  if (unit === 'hour' || unit === 'minute') return value;
  return stepDatePart(value, unit, direction);
}

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

function TimeWheelPicker({ accentSoftTone, accentTone, onChange, value }: {
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

function DateTimePicker({
  accentSoftTone,
  accentTone,
  endDate,
  endTime,
  onChangeEndDate,
  onChangeEndTime,
  onChangeStartDate,
  onChangeStartTime,
  startDate,
  startTime,
}: {
  accentSoftTone: string;
  accentTone: string;
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
    const shifted = addMinutesToDateTime(nextDate, nextTime, duration > 0 ? duration : 60);
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
        accentSoftTone={accentSoftTone}
        accentTone={accentTone}
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
          accentSoftTone={accentSoftTone}
          accentTone={accentTone}
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

function RepeatSelector({
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

function ActivityTypeSelector({
  accentSoftTone,
  accentTone,
  activityInput,
  onChangeActivityInput,
}: {
  accentSoftTone: string;
  accentTone: string;
  activityInput: CalendarActivityInput;
  onChangeActivityInput: (value: CalendarActivityInput) => void;
}) {
  return (
    <View style={styles.calendarActivityOptionGrid}>
      {activityOptions.map((option) => {
        const active = activityInput === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChangeActivityInput(option.value)}
            style={({ pressed }) => [
              styles.calendarActivityOption,
              active && { backgroundColor: accentTone, borderColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Ionicons color={active ? '#ffffff' : textColors.secondary} name={option.icon} size={17} />
            <Text style={[styles.calendarActivityOptionText, active && styles.calendarChipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NotificationLeadSelector({
  accentSoftTone,
  accentTone,
  notificationHoursBefore,
  onChangeNotificationHoursBefore,
}: {
  accentSoftTone: string;
  accentTone: string;
  notificationHoursBefore?: number | null;
  onChangeNotificationHoursBefore: (value: number | null) => void;
}) {
  const isQuickOption = notificationLeadOptions.some((option) => option.value === notificationHoursBefore);
  const [showCustomInput, setShowCustomInput] = useState(typeof notificationHoursBefore === 'number' && !isQuickOption);
  const [customMinutes, setCustomMinutes] = useState(() => (
    typeof notificationHoursBefore === 'number' ? String(Math.max(1, Math.round(notificationHoursBefore * 60))) : '60'
  ));

  useEffect(() => {
    if (typeof notificationHoursBefore !== 'number') return;
    setCustomMinutes(String(Math.max(1, Math.round(notificationHoursBefore * 60))));
    if (!notificationLeadOptions.some((option) => option.value === notificationHoursBefore)) setShowCustomInput(true);
  }, [notificationHoursBefore]);

  const applyCustomMinutes = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 5);
    const minutes = Number(digits);
    const normalizedText = Number.isFinite(minutes) && minutes > 10080 ? '10080' : digits;
    setCustomMinutes(normalizedText);
    if (Number.isFinite(minutes) && minutes > 0) {
      onChangeNotificationHoursBefore(Math.min(minutes, 10080) / 60);
    }
  };

  return (
    <View style={styles.calendarActivityOptionGrid}>
      {notificationLeadOptions.map((option) => {
        const active = !showCustomInput && notificationHoursBefore === option.value;
        return (
          <Pressable
            key={option.value ?? 'none'}
            onPress={() => {
              setShowCustomInput(false);
              onChangeNotificationHoursBefore(option.value);
            }}
            style={({ pressed }) => [
              styles.calendarActivityOption,
              active && { backgroundColor: accentTone, borderColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Text style={[styles.calendarActivityOptionText, active && styles.calendarChipTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel="알림 시간 직접 설정"
        accessibilityState={{ selected: showCustomInput }}
        onPress={() => {
          setShowCustomInput(true);
          const minutes = Math.max(1, Number(customMinutes) || 60);
          setCustomMinutes(String(minutes));
          onChangeNotificationHoursBefore(Math.min(minutes, 10080) / 60);
        }}
        style={({ pressed }) => [
          styles.calendarActivityOption,
          showCustomInput && { backgroundColor: accentTone, borderColor: accentTone },
          pressed && styles.pressedFeedback,
        ]}
      >
        <Text style={[styles.calendarActivityOptionText, showCustomInput && styles.calendarChipTextSelected]}>직접 설정</Text>
      </Pressable>
      {showCustomInput && (
        <View style={styles.calendarNotificationCustomRow}>
          <TextInput
            accessibilityLabel="일정 알림을 몇 분 전에 받을지 입력"
            keyboardType="number-pad"
            maxLength={5}
            onBlur={() => {
              if (Number(customMinutes) > 0) return;
              setCustomMinutes('60');
              onChangeNotificationHoursBefore(1);
            }}
            onChangeText={applyCustomMinutes}
            selectTextOnFocus
            style={[styles.calendarNotificationCustomInput, { borderColor: accentTone }]}
            value={customMinutes}
          />
          <Text style={styles.calendarNotificationCustomUnit}>분 전</Text>
          <Text style={styles.calendarNotificationCustomHint}>최대 7일 전까지 설정할 수 있어요</Text>
        </View>
      )}
    </View>
  );
}

export function CalendarEventEditor({
  accentSoftTone,
  accentTone,
  activityInput,
  endDate,
  endTime,
  isRepeatLocked = false,
  isOpen,
  location,
  mapPickerUrl,
  memo,
  onChangeEndDate,
  onChangeEndTime,
  onChangeLocation,
  onChangeNotificationHoursBefore,
  onChangeSelectedLocation,
  onChangeMemo,
  onChangeActivityInput,
  onChangeRepeatEndDate,
  onChangeRepeatMode,
  onChangeRepeatWeekdays,
  onChangeStartDate,
  onChangeStartTime,
  onChangeTitle,
  onClose,
  onSave,
  repeatEndDate,
  repeatMode,
  repeatWeekdays,
  notificationHoursBefore,
  selectedLocation,
  startDate,
  startTime,
  title,
}: Props) {
  const insets = useSafeAreaInsets();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isMapPickerSearchOpen, setIsMapPickerSearchOpen] = useState(false);
  const [mapPickerSearchMessage, setMapPickerSearchMessage] = useState('');
  const [mapPickerSearchResults, setMapPickerSearchResults] = useState<CalendarLocationCandidate[]>([]);
  const [mapPickerSearchText, setMapPickerSearchText] = useState('');
  const [pendingLocation, setPendingLocation] = useState<CalendarLocationCandidate | null>(null);
  const mapPickerWebViewRef = useRef<WebViewType>(null);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardOpen(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardOpen(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (compareDateTime(startDate, '00:00', repeatEndDate, '00:00') > 0) {
      onChangeRepeatEndDate(formatDate(parseDateParts(startDate).year, parseDateParts(startDate).month, parseDateParts(startDate).day));
    }
  }, [onChangeRepeatEndDate, repeatEndDate, startDate]);

  const mapPickerSource = mapPickerUrl ? `${mapPickerUrl}${mapPickerUrl.includes('?') ? '&' : '?'}picker=1` : '';

  useEffect(() => {
    if (!isMapPickerOpen) return;
    const query = mapPickerSearchText.trim();
    if (query.length < 1) {
      setMapPickerSearchResults([]);
      setMapPickerSearchMessage('');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchNaverPlaces({ query, size: 8 })
        .then((response) => {
          if (cancelled) return;
          const items = Array.isArray(response?.items) ? response.items : [];
          const results = items.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const raw = item as Record<string, unknown>;
            const lat = typeof raw.lat === 'number' ? raw.lat : undefined;
            const lng = typeof raw.lng === 'number' ? raw.lng : undefined;
            const label = typeof raw.label === 'string' ? raw.label : '';
            if (!label || typeof lat !== 'number' || typeof lng !== 'number') return [];
            return [{
              address: typeof raw.address === 'string' ? raw.address : undefined,
              category: typeof raw.category === 'string' ? raw.category : undefined,
              label,
              lat,
              lng,
              source: 'naver_local',
            } satisfies CalendarLocationCandidate];
          });
          setMapPickerSearchResults(results);
          setMapPickerSearchMessage(results.length === 0 ? '검색 결과가 없습니다.' : '');
        })
        .catch(() => {
          if (!cancelled) {
            setMapPickerSearchResults([]);
            setMapPickerSearchMessage('검색 연결을 확인해주세요.');
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isMapPickerOpen, mapPickerSearchText]);

  const applyPickedLocation = (candidate: CalendarLocationCandidate) => {
    onChangeLocation(candidate.label);
    onChangeSelectedLocation?.(candidate);
    setPendingLocation(null);
    setIsMapPickerOpen(false);
    Keyboard.dismiss();
  };

  const focusMapPickerPlace = (place: CalendarLocationCandidate) => {
    Keyboard.dismiss();
    setIsMapPickerSearchOpen(false);
    setMapPickerSearchText(place.label);
    mapPickerWebViewRef.current?.injectJavaScript(`
      if (typeof window.focusStation === 'function') {
        window.focusStation(${JSON.stringify({
          address: place.address,
          city: place.city,
          label: place.label,
          lat: place.lat,
          lng: place.lng,
          name: place.label,
          region: place.region,
          source: place.source,
        })});
      }
      true;
    `);
  };

  const handleMapPickerMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        location?: Partial<CalendarLocationCandidate>;
        station?: Record<string, unknown>;
        type?: string;
      };
      if (payload.type === 'map-picked' && payload.location) {
        const lat = typeof payload.location.lat === 'number' ? payload.location.lat : undefined;
        const lng = typeof payload.location.lng === 'number' ? payload.location.lng : undefined;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const address = typeof payload.location.address === 'string' ? payload.location.address : undefined;
        const city = typeof payload.location.city === 'string' ? payload.location.city : undefined;
        const region = typeof payload.location.region === 'string' ? payload.location.region : undefined;
        const fallbackLabel = typeof payload.location.label === 'string' ? payload.location.label : '';
        const label = address || region || fallbackLabel || '지도 선택 위치';
        setPendingLocation({
          address,
          city,
          label,
          lat,
          lng,
          region,
          source: payload.location.source || 'naver_map',
        });
      }
      if (payload.type === 'station-selected' && payload.station) {
        const station = payload.station;
        const lat = typeof station.lat === 'number' ? station.lat : undefined;
        const lng = typeof station.lng === 'number' ? station.lng : undefined;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const name = typeof station.name === 'string' ? station.name : '';
        const city = typeof station.city === 'string' ? station.city : '';
        const sido = typeof station.sido === 'string' ? station.sido : '';
        setPendingLocation({
          address: typeof station.addr === 'string' ? station.addr : undefined,
          city: sido || undefined,
          label: name || city || '지도 선택 위치',
          lat,
          lng,
          region: city || name || undefined,
          source: 'station',
        });
      }
    } catch {
      // Ignore messages that are not picker payloads.
    }
  };

  const handleRequestClose = () => {
    if (isKeyboardOpen) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  };

  return (
    <Modal animationType="slide" visible={isOpen} onRequestClose={handleRequestClose}>
      <View style={styles.calendarSheetBackdrop}>
        <View style={[styles.calendarEditorHeader, { minHeight: 64 + insets.top, paddingTop: Math.max(12, insets.top) }]}>
          <Pressable accessibilityLabel="일정 입력 닫기" onPress={onClose} style={({ pressed }) => [styles.calendarEditorHeaderButton, pressed && styles.pressedFeedback]}>
            <Ionicons color="#141821" name="close" size={32} />
          </Pressable>
          <Text style={styles.calendarEditorHeaderTitle}>일정</Text>
          <View style={styles.calendarEditorHeaderButton} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.calendarSheetKeyboardArea}>
          <ScrollView contentContainerStyle={styles.calendarSheetScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.calendarSheetScroll}>
            <View style={styles.calendarSheet}>
            <View style={styles.calendarSheetTitleRow}>
              <View style={[styles.calendarColorDot, { backgroundColor: accentTone }]} />
              <TextInput
                onChangeText={onChangeTitle}
                placeholder="일정을 입력하세요."
                placeholderTextColor="#8a94a3"
                style={styles.calendarSheetTitleInput}
                value={title}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetDateTimeBlock}>
              <DateTimePicker
                accentSoftTone={accentSoftTone}
                accentTone={accentTone}
                endDate={endDate}
                endTime={endTime}
                onChangeEndDate={onChangeEndDate}
                onChangeEndTime={onChangeEndTime}
                onChangeStartDate={onChangeStartDate}
                onChangeStartTime={onChangeStartTime}
                startDate={startDate}
                startTime={startTime}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View pointerEvents={isRepeatLocked ? 'none' : 'auto'} style={[styles.calendarSheetRow, isRepeatLocked && styles.calendarSheetRowLocked]}>
              <Ionicons color="#8a94a3" name="repeat-outline" size={20} />
              <RepeatSelector
                accentSoftTone={accentSoftTone}
                accentTone={accentTone}
                onChangeRepeatEndDate={onChangeRepeatEndDate}
                onChangeRepeatMode={onChangeRepeatMode}
                onChangeRepeatWeekdays={onChangeRepeatWeekdays}
                repeatEndDate={repeatEndDate}
                repeatMode={repeatMode}
                repeatWeekdays={repeatWeekdays}
                startDate={startDate}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <Ionicons color="#8a94a3" name="compass-outline" size={20} />
              <ActivityTypeSelector
                accentSoftTone={accentSoftTone}
                accentTone={accentTone}
                activityInput={activityInput}
                onChangeActivityInput={onChangeActivityInput}
              />
            </View>
            <View style={styles.calendarDefaultGuide}>
              <View style={styles.calendarDefaultGuideIcon}>
                <AppActionIcon name={defaultActivityGuides[activityInput].icon} size={31} />
              </View>
              <View style={styles.calendarDefaultGuideTextGroup}>
                <Text style={styles.calendarDefaultGuideTitle}>{defaultActivityGuides[activityInput].title}</Text>
                <Text style={styles.calendarDefaultGuideDesc}>{defaultActivityGuides[activityInput].desc}</Text>
              </View>
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <AppActionIcon name="notification" size={24} />
              <NotificationLeadSelector
                accentSoftTone={accentSoftTone}
                accentTone={accentTone}
                notificationHoursBefore={notificationHoursBefore}
                onChangeNotificationHoursBefore={onChangeNotificationHoursBefore}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <AppActionIcon name="location" size={24} />
              {!!mapPickerSource && (
                <Pressable
                  accessibilityLabel="지도에서 장소 선택"
                  onPress={() => {
                    Keyboard.dismiss();
                    setPendingLocation(null);
                    setIsMapPickerOpen(true);
                  }}
                  style={({ pressed }) => [styles.calendarSheetRowAction, pressed && styles.pressedFeedback]}
                >
                  <Text style={styles.calendarSheetRowText}>지도에서 장소 선택</Text>
                  <AppActionIcon name="map" size={25} />
                </Pressable>
              )}
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={[styles.calendarSheetRow, styles.calendarMemoRow]}>
              <Ionicons color="#8a94a3" name="document-text-outline" size={20} />
              <TextInput
                multiline
                onChangeText={onChangeMemo}
                placeholder="메모"
                placeholderTextColor="#8a94a3"
                style={[styles.calendarSheetTextInput, styles.calendarMemoInput]}
                textAlignVertical="top"
                value={memo}
              />
            </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <Pressable
          accessibilityLabel="일정 저장"
          disabled={!title.trim()}
          onPress={onSave}
          style={({ pressed }) => [
            styles.calendarEditorSaveFab,
            { backgroundColor: title.trim() ? accentTone : textColors.disabled, bottom: Math.max(18, insets.bottom + 14), shadowColor: accentTone },
            pressed && title.trim() && styles.pressedFeedback,
          ]}
        >
          <Ionicons color="#ffffff" name="checkmark" size={32} />
        </Pressable>
        <Modal animationType="slide" visible={isMapPickerOpen} onRequestClose={() => setIsMapPickerOpen(false)}>
          <View style={styles.calendarMapPickerBackdrop}>
            <View style={[styles.calendarMapPickerHeader, { paddingTop: Math.max(12, insets.top) }]}>
              <Pressable accessibilityLabel="지도 선택 닫기" onPress={() => setIsMapPickerOpen(false)} style={({ pressed }) => [styles.calendarEditorHeaderButton, pressed && styles.pressedFeedback]}>
                <Ionicons color="#141821" name="close" size={30} />
              </Pressable>
              <View style={styles.calendarMapPickerTitleGroup}>
                <Text style={styles.calendarEditorHeaderTitle}>지도에서 선택</Text>
              </View>
              <View style={styles.calendarEditorHeaderButton} />
            </View>
            <View style={styles.calendarMapPickerSearchWrap}>
              <View style={styles.calendarMapPickerSearchBar}>
                <AppActionIcon name="search" size={23} />
                <TextInput
                  onChangeText={(text) => {
                    setMapPickerSearchText(text);
                    setIsMapPickerSearchOpen(true);
                  }}
                  onFocus={() => setIsMapPickerSearchOpen(true)}
                  placeholder="지역, 측정소, 주소 검색"
                  placeholderTextColor="#8a94a3"
                  returnKeyType="search"
                  style={styles.calendarMapPickerSearchInput}
                  value={mapPickerSearchText}
                />
              </View>
              {isMapPickerSearchOpen && mapPickerSearchResults.length > 0 && (
                <View style={styles.calendarMapPickerSearchResults}>
                  {mapPickerSearchResults.map((place, index) => (
                    <Pressable
                      key={`${place.label}-${place.lat}-${place.lng}-${index}`}
                      onPress={() => focusMapPickerPlace(place)}
                      style={({ pressed }) => [styles.calendarMapPickerSearchResultItem, pressed && styles.pressedFeedback]}
                    >
                      <Text style={styles.calendarMapPickerSearchResultTitle}>{place.label}</Text>
                      <Text numberOfLines={1} style={styles.calendarMapPickerSearchResultMeta}>{[place.category, place.address].filter(Boolean).join(' / ')}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {isMapPickerSearchOpen && !!mapPickerSearchMessage && mapPickerSearchResults.length === 0 && (
                <Text style={styles.calendarMapPickerSearchMessage}>{mapPickerSearchMessage}</Text>
              )}
            </View>
            {!!mapPickerSource && (
              <WebView
                ref={mapPickerWebViewRef}
                source={{ uri: mapPickerSource }}
                javaScriptEnabled
                domStorageEnabled
                androidLayerType="hardware"
                mixedContentMode="always"
                originWhitelist={['*']}
                setSupportMultipleWindows={false}
                thirdPartyCookiesEnabled
                onMessage={handleMapPickerMessage}
                style={styles.calendarMapPickerWebView}
              />
            )}
            <View style={[styles.calendarMapPickerConfirmBar, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
              <View style={styles.calendarMapPickerConfirmTextGroup}>
                <Text style={styles.calendarMapPickerConfirmTitle}>
                  {pendingLocation ? pendingLocation.label : '지도에서 위치를 눌러주세요'}
                </Text>
                <Text style={styles.calendarMapPickerConfirmMeta}>
                  {pendingLocation ? '선택한 위치를 일정에 저장합니다.' : ''}
                </Text>
              </View>
              <Pressable
                disabled={!pendingLocation}
                onPress={() => pendingLocation && applyPickedLocation(pendingLocation)}
                style={({ pressed }) => [
                  styles.calendarMapPickerConfirmButton,
                  { backgroundColor: pendingLocation ? accentTone : textColors.disabled },
                  pressed && pendingLocation && styles.pressedFeedback,
                ]}
              >
                <Text style={styles.calendarMapPickerConfirmButtonText}>이 위치 선택</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}
