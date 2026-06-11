import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';

import { searchNaverPlaces } from '../../api/dustEndpoints';
import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/dust';
import {
  addMinutesToDateTime,
  compareDateTime,
  formatDateDisplay,
  formatDate,
  parseDateParts,
  parseTimeParts,
  stepDatePart,
  stepTime,
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
type DateTarget = 'start' | 'end';
export type CalendarActivityInput = 'auto' | CalendarEvent['activityType'];

const activityOptions: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: CalendarActivityInput }> = [
  { icon: 'sparkles-outline', label: '자동', value: 'auto' },
  { icon: 'home-outline', label: '실내', value: 'indoor' },
  { icon: 'walk-outline', label: '실외', value: 'outdoor' },
  { icon: 'bus-outline', label: '이동', value: 'transit' },
];

const notificationLeadOptions: Array<{ label: string; value: number | null }> = [
  { label: '\uC5C6\uC74C', value: null },
  { label: '1\uC2DC\uAC04 \uC804', value: 1 },
  { label: '3\uC2DC\uAC04 \uC804', value: 3 },
  { label: '6\uC2DC\uAC04 \uC804', value: 6 },
  { label: '12\uC2DC\uAC04 \uC804', value: 12 },
  { label: '24\uC2DC\uAC04 \uC804', value: 24 },
];

type Props = {
  accentSoftTone: string;
  accentTone: string;
  activityInput: CalendarActivityInput;
  endDate: string;
  endTime: string;
  isEditing?: boolean;
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
  onChangeSensitive: (value: boolean) => void;
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
  sensitive: boolean;
  startDate: string;
  startTime: string;
  title: string;
};

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

function DateTimePicker({
  accentSoftTone,
  accentTone,
  activeTarget,
  endDate,
  endTime,
  onChangeActiveTarget,
  onChangeEndDate,
  onChangeEndTime,
  onChangeStartDate,
  onChangeStartTime,
  startDate,
  startTime,
}: {
  accentSoftTone: string;
  accentTone: string;
  activeTarget: DateTarget | null;
  endDate: string;
  endTime: string;
  onChangeActiveTarget: (target: DateTarget | null) => void;
  onChangeEndDate: (value: string) => void;
  onChangeEndTime: (value: string) => void;
  onChangeStartDate: (value: string) => void;
  onChangeStartTime: (value: string) => void;
  startDate: string;
  startTime: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const activeDate = activeTarget === 'end' ? endDate : startDate;
  const activeTime = activeTarget === 'end' ? endTime : startTime;
  const dateParts = parseDateParts(activeDate);
  const timeParts = parseTimeParts(activeTime);
  const values: Record<DateTimeUnit, string> = {
    day: formatWheelDay(activeDate),
    hour: timeParts.hour,
    minute: timeParts.minute,
    month: `${dateParts.month + 1}월`,
    year: String(dateParts.year),
  };

  const setStartDateTime = (nextDate: string, nextTime: string) => {
    onChangeStartDate(nextDate);
    onChangeStartTime(nextTime);
    if (compareDateTime(nextDate, nextTime, endDate, endTime) >= 0) {
      const shifted = addMinutesToDateTime(nextDate, nextTime, 60);
      onChangeEndDate(shifted.date);
      onChangeEndTime(shifted.time);
    }
  };

  const setEndDateTime = (nextDate: string, nextTime: string) => {
    if (compareDateTime(startDate, startTime, nextDate, nextTime) >= 0) {
      const shifted = addMinutesToDateTime(startDate, startTime, 60);
      onChangeEndDate(shifted.date);
      onChangeEndTime(shifted.time);
      return;
    }
    onChangeEndDate(nextDate);
    onChangeEndTime(nextTime);
  };

  const stepActiveValue = (unit: DateTimeUnit, direction: 1 | -1) => {
    if (unit === 'hour' || unit === 'minute') {
      const nextTime = stepTime(activeTime, unit, direction);
      if (activeTarget === 'end') setEndDateTime(activeDate, nextTime);
      else setStartDateTime(activeDate, nextTime);
      return;
    }

    const nextDate = stepDatePart(activeDate, unit, direction);
    if (activeTarget === 'end') setEndDateTime(nextDate, activeTime);
    else setStartDateTime(nextDate, activeTime);
  };

  const selectTarget = (target: DateTarget) => {
    animatePickerLayout();
    onChangeActiveTarget(target);
  };

  useEffect(() => {
    if (!activeTarget) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, { duration: 180, toValue: 1, useNativeDriver: true }).start();
  }, [activeTarget, progress]);

  return (
    <View style={styles.calendarDateTimePickerGroup}>
      <View style={styles.calendarDateTimeSummaryRow}>
        <Pressable
          onPress={() => selectTarget('start')}
          style={({ pressed }) => [
            styles.calendarDateTimeSummaryCard,
            activeTarget === 'start' && { backgroundColor: accentSoftTone, borderColor: accentTone },
            pressed && styles.pressedFeedback,
          ]}
        >
          <Text style={[styles.calendarDateTimeSummaryLabel, activeTarget === 'start' && { color: accentTone }]}>시작</Text>
          <Text style={styles.calendarDateTimeSummaryDate}>{formatDateDisplay(startDate)}</Text>
          <Text style={[styles.calendarDateTimeSummaryTime, activeTarget === 'start' && { color: accentTone }]}>{startTime}</Text>
        </Pressable>
        <Ionicons color="#8a94a3" name="chevron-forward" size={22} />
        <Pressable
          onPress={() => selectTarget('end')}
          style={({ pressed }) => [
            styles.calendarDateTimeSummaryCard,
            activeTarget === 'end' && { backgroundColor: accentSoftTone, borderColor: accentTone },
            pressed && styles.pressedFeedback,
          ]}
        >
          <Text style={[styles.calendarDateTimeSummaryLabel, activeTarget === 'end' && { color: accentTone }]}>종료</Text>
          <Text style={styles.calendarDateTimeSummaryDate}>{formatDateDisplay(endDate)}</Text>
          <Text style={[styles.calendarDateTimeSummaryTime, activeTarget === 'end' && { color: accentTone }]}>{endTime}</Text>
        </Pressable>
      </View>

      {!!activeTarget && (
        <Animated.View
          style={[
            styles.calendarDateWheel,
            {
              opacity: progress,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
            },
          ]}
        >
          <View style={[styles.calendarDateWheelHighlight, { backgroundColor: accentSoftTone }]} />
          {pickerUnits.map((unit) => {
            const dragHandlers = buildDragHandlers((direction) => stepActiveValue(unit.key, direction));
            return (
              <View key={unit.key} style={styles.calendarDateWheelColumn}>
                <Pressable onPress={() => stepActiveValue(unit.key, 1)} style={({ pressed }) => [styles.calendarDateWheelStep, pressed && styles.pressedFeedback]}>
                  <Ionicons color={accentTone} name="chevron-up" size={16} />
                </Pressable>
                <Pressable
                  onPress={() => stepActiveValue(unit.key, 1)}
                  style={({ pressed }) => [styles.calendarDateWheelValue, pressed && styles.pressedFeedback]}
                  {...dragHandlers}
                >
                  <Text style={styles.calendarDateWheelLabel}>{unit.label}</Text>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={styles.calendarDateWheelText}>{values[unit.key]}</Text>
                </Pressable>
                <Pressable onPress={() => stepActiveValue(unit.key, -1)} style={({ pressed }) => [styles.calendarDateWheelStep, pressed && styles.pressedFeedback]}>
                  <Ionicons color={accentTone} name="chevron-down" size={16} />
                </Pressable>
              </View>
            );
          })}
        </Animated.View>
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
                active && { backgroundColor: accentSoftTone, borderColor: accentTone },
                pressed && styles.pressedFeedback,
              ]}
            >
              <Text style={[styles.calendarRepeatOptionText, active && { color: accentTone }]}>{option.label}</Text>
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
                <Text style={[styles.calendarWeekdayChipText, active && { color: '#ffffff' }]}>{label}</Text>
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
              active && { backgroundColor: accentSoftTone, borderColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Ionicons color={active ? accentTone : '#687180'} name={option.icon} size={17} />
            <Text style={[styles.calendarActivityOptionText, active && { color: accentTone }]}>{option.label}</Text>
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
  return (
    <View style={styles.calendarActivityOptionGrid}>
      {notificationLeadOptions.map((option) => {
        const active = notificationHoursBefore === option.value;
        return (
          <Pressable
            key={option.value ?? 'none'}
            onPress={() => onChangeNotificationHoursBefore(option.value)}
            style={({ pressed }) => [
              styles.calendarActivityOption,
              active && { backgroundColor: accentSoftTone, borderColor: accentTone },
              pressed && styles.pressedFeedback,
            ]}
          >
            <Text style={[styles.calendarActivityOptionText, active && { color: accentTone }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CalendarEventEditor({
  accentSoftTone,
  accentTone,
  activityInput,
  endDate,
  endTime,
  isEditing = false,
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
  onChangeSensitive,
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
  sensitive,
  startDate,
  startTime,
  title,
}: Props) {
  const insets = useSafeAreaInsets();
  const [activeTarget, setActiveTarget] = useState<DateTarget | null>(null);
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
              <Ionicons color="#8a94a3" name="time-outline" size={20} />
              <DateTimePicker
                accentSoftTone={accentSoftTone}
                accentTone={accentTone}
                activeTarget={activeTarget}
                endDate={endDate}
                endTime={endTime}
                onChangeActiveTarget={setActiveTarget}
                onChangeEndDate={onChangeEndDate}
                onChangeEndTime={onChangeEndTime}
                onChangeStartDate={onChangeStartDate}
                onChangeStartTime={onChangeStartTime}
                startDate={startDate}
                startTime={startTime}
              />
            </View>
            {!isEditing && (
              <>
                <View style={styles.calendarSheetDivider} />
                <View style={styles.calendarSheetRow}>
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
              </>
            )}
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
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <Ionicons color="#8a94a3" name="notifications-outline" size={20} />
              <NotificationLeadSelector
                accentSoftTone={accentSoftTone}
                accentTone={accentTone}
                notificationHoursBefore={notificationHoursBefore}
                onChangeNotificationHoursBefore={onChangeNotificationHoursBefore}
              />
            </View>
            <View style={styles.calendarSheetDivider} />
            <View style={styles.calendarSheetRow}>
              <Ionicons color="#8a94a3" name="location-outline" size={20} />
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
                  <Text style={styles.calendarSheetRowText}>지도에서 선택(기본값 : 현재 위치)</Text>
                  <Ionicons color={accentTone} name="map-outline" size={20} />
                </Pressable>
              )}
            </View>
            <View style={styles.calendarSheetDivider} />
            <Pressable onPress={() => onChangeSensitive(!sensitive)} style={({ pressed }) => [styles.calendarSheetRow, pressed && styles.pressedFeedback]}>
              <Ionicons color="#8a94a3" name="fitness-outline" size={20} />
              <Text style={styles.calendarSheetRowText}>아이/어르신 함께</Text>
              <View style={[styles.calendarEditorSwitch, sensitive && { backgroundColor: accentTone }]}>
                <View style={[styles.calendarEditorSwitchThumb, sensitive && styles.calendarEditorSwitchThumbActive]} />
              </View>
            </Pressable>
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
            { backgroundColor: title.trim() ? accentTone : '#d9dee5', bottom: Math.max(18, insets.bottom + 14), shadowColor: accentTone },
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
                <Ionicons color="#8a94a3" name="search-outline" size={18} />
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
                androidLayerType="software"
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
                  { backgroundColor: pendingLocation ? accentTone : '#d9dee5' },
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
