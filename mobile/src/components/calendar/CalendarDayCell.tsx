import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Reanimated, { FadeIn, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { WeatherIcon } from '../shared/WeatherIcon';
import { bauhausColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/calendar';
import type { CalendarDailyWeather, CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { accentSoftTone, accentTone } from '../../theme/appTheme';

type CalendarRange = { endDate: string; startDate: string };

type Props = {
  cellIndex: number;
  // 일정 줄 자리를 미리 잡지 않습니다(주 보기 위쪽 날짜 줄).
  compact?: boolean;
  dailyWeather?: CalendarDailyWeather;
  date: string;
  day: number;
  eventCount: number;
  eventItems: Array<CalendarEvent | null>;
  fillsParent?: boolean;
  getEventTone: (event: CalendarEvent) => string;
  isRangeAnchor: boolean;
  isSelected: boolean;
  isToday: boolean;
  onLayout?: () => void;
  onLongPress: () => void;
  onPress: () => void;
  onRef?: (ref: View | null) => void;
  range?: CalendarRange | null;
  style?: StyleProp<ViewStyle>;
  weatherRisk?: CalendarWeatherRiskIndicator;
};

export function CalendarDayCell({
  cellIndex,
  compact,
  dailyWeather,
  date,
  day,
  eventCount,
  eventItems,
  fillsParent,
  getEventTone,
  isRangeAnchor,
  isSelected,
  isToday,
  onLayout,
  onLongPress,
  onPress,
  onRef,
  range,
  style,
  weatherRisk,
}: Props) {
  const inActiveRange = !!range && date >= range.startDate && date <= range.endDate;
  // 날짜를 고르면 숫자가 한 번 톡 커졌다 돌아옵니다(애니메이션 줄이기 설정이면 생략).
  const reduceMotion = useReducedMotion();
  const dayScale = useSharedValue(1);
  const hasMountedRef = useRef(false);
  useEffect(() => {
    const isFirstRun = !hasMountedRef.current;
    hasMountedRef.current = true;
    if (isFirstRun || !isSelected || reduceMotion) return;
    dayScale.value = withSequence(withTiming(1.22, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 }));
  }, [dayScale, isSelected, reduceMotion]);
  const dayScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: dayScale.value }] }));
  const visibleEventItems = eventItems.slice(0, 3);
  const visibleEventCount = visibleEventItems.filter(Boolean).length;
  const hiddenEventCount = Math.max(0, eventCount - visibleEventCount);

  return (
    <Pressable
      ref={(ref) => onRef?.(ref as View | null)}
      delayLongPress={320}
      onLongPress={onLongPress}
      onLayout={onLayout}
      onPress={onPress}
      style={[
        styles.calendarDayCell,
        fillsParent && styles.calendarLibraryDayCell,
        weatherRisk && { backgroundColor: `${weatherRisk.tone}0d` },
        isSelected && { backgroundColor: accentSoftTone },
        inActiveRange && styles.calendarDraftRangeCell,
        style,
      ]}
    >
      {isRangeAnchor && <View style={[styles.calendarRangeAnchorMark, { backgroundColor: accentTone }]} />}
      {!!weatherRisk && (
        <View style={[styles.calendarDayWeatherRiskBadge, { backgroundColor: `${weatherRisk.tone}18`, borderColor: `${weatherRisk.tone}55` }]}>
          {weatherRisk.imageKind ? <WeatherIcon kind={weatherRisk.imageKind} size={13} /> : <Ionicons color={weatherRisk.tone} name={weatherRisk.icon} size={11} />}
        </View>
      )}
      {/* 일정이 없어도 예보가 있는 날은 그날 날씨를 구석에 작게 보여 준다(일정 날씨 배지가 있으면 그쪽이 우선). */}
      {!weatherRisk && !!dailyWeather && (
        <View style={styles.calendarDayWeatherIcon}>
          <WeatherIcon kind={dailyWeather.kind} size={14} />
        </View>
      )}
      {/* 비·눈은 하루 종일 오는 게 아니라서 언제 오는지 아이콘 아래에 적는다. */}
      {!!dailyWeather?.time && (
        <Text numberOfLines={1} style={[styles.calendarDayWeatherTime, { color: weatherRisk?.tone ?? accentTone }]}>{dailyWeather.time}</Text>
      )}
      <Reanimated.Text style={[
        dayScaleStyle,
        styles.calendarDayText,
        isToday && { color: accentTone },
        isSelected && { color: accentTone },
      ]}>{day}</Reanimated.Text>
      <View style={[styles.calendarEventLineStack, compact && styles.calendarEventLineStackCompact]}>
        {visibleEventItems.map((event, laneIndex) => {
          if (!event) {
            return <View key={`${date}-empty-lane-${laneIndex}`} style={styles.calendarEventLineSpacer} />;
          }

          const endDate = event.endDate ?? event.date;
          const isRangeEvent = event.date !== endDate;
          const isStart = date === event.date;
          const isEnd = date === endDate;
          const startsWeek = cellIndex % 7 === 0;
          const endsWeek = cellIndex % 7 === 6;
          const segmentStart = !isRangeEvent || isStart || startsWeek;
          const segmentEnd = !isRangeEvent || isEnd || endsWeek;
          const tone = event.sensitive ? bauhausColors.amber : getEventTone(event);

          return (
            // 새로 저장한 일정의 선이 칸에 스르륵 나타납니다.
            <Reanimated.View
              entering={FadeIn.duration(260).reduceMotion(ReduceMotion.System)}
              key={`${date}-${event.id}`}
              style={[
                styles.calendarEventLine,
                {
                  backgroundColor: tone,
                  borderBottomLeftRadius: segmentStart ? 4 : 0,
                  borderTopLeftRadius: segmentStart ? 4 : 0,
                  borderBottomRightRadius: segmentEnd ? 4 : 0,
                  borderTopRightRadius: segmentEnd ? 4 : 0,
                  marginLeft: isRangeEvent && !segmentStart ? -5 : 1,
                  marginRight: isRangeEvent && !segmentEnd ? -5 : 1,
                },
              ]}
            >
              <Text numberOfLines={1} style={styles.calendarEventLineText}>
                {(!isRangeEvent || isStart || startsWeek) ? event.title : ''}
              </Text>
            </Reanimated.View>
          );
        })}
        {hiddenEventCount > 0 && (
          <Text style={styles.calendarEventMoreText}>+{hiddenEventCount}</Text>
        )}
      </View>
    </Pressable>
  );
}
