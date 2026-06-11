import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/dust';
import type { CalendarWeatherRiskIndicator } from './calendarWeatherRisk';

type CalendarRange = { endDate: string; startDate: string };

type Props = {
  accentSoftTone: string;
  accentTone: string;
  cellIndex: number;
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
  accentSoftTone,
  accentTone,
  cellIndex,
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
          <Ionicons color={weatherRisk.tone} name={weatherRisk.icon} size={11} />
        </View>
      )}
      <Text style={[
        styles.calendarDayText,
        isToday && { color: accentTone },
        isSelected && { color: accentTone },
      ]}>{day}</Text>
      <View style={styles.calendarEventLineStack}>
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
          const tone = event.sensitive ? '#c58a19' : getEventTone(event);

          return (
            <View
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
            </View>
          );
        })}
        {hiddenEventCount > 0 && (
          <Text style={styles.calendarEventMoreText}>+{hiddenEventCount}</Text>
        )}
      </View>
    </Pressable>
  );
}
