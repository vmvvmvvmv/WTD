import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/dust';
import { eventDateLabel, eventRangeLength, formatDateDisplay, formatSelectedDateTitle } from './calendarUtils';
import type { CalendarRiskResult } from './calendarRiskEvaluator';
import type { CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { useCalendarDaySheetDrag } from './useCalendarDaySheetDrag';

const TEXT = {
  adjust: '주의',
  day: '일',
  emptyDesc: '활동 일정을 추가하면 공기와 날씨 기준으로 같이 평가해요.',
  emptyTitle: '일정이 없습니다.',
  good: '좋음',
  indoor: '실내',
  move: '이동',
  outdoor: '실외',
  today: '오늘',
};

type Props = {
  accentTone: string;
  events: CalendarEvent[];
  isExpanded?: boolean;
  onDismiss: () => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onExpandStateChange?: (expanded: boolean) => void;
  onRemoveEvent: (eventId: string) => void;
  pm10?: number;
  riskByEvent?: Record<string, CalendarRiskResult>;
  selectedDate: string;
  style?: any;
  temperature?: number;
  todayDateLabel: string;
  weatherRisks?: CalendarWeatherRiskIndicator[];
  weatherLabel?: string;
};

function eventIcon(event: CalendarEvent): keyof typeof Ionicons.glyphMap {
  if (event.activityType === 'indoor') return 'home-outline';
  if (event.activityType === 'transit') return 'bus-outline';
  return 'walk-outline';
}

function activityLabel(event: CalendarEvent) {
  if (event.activityType === 'indoor') return TEXT.indoor;
  if (event.activityType === 'transit') return TEXT.move;
  return TEXT.outdoor;
}

function impactLabel(event: CalendarEvent) {
  if (event.sensitive && event.activityType === 'outdoor') return TEXT.adjust;
  return TEXT.good;
}

function weatherIcon(label?: string): keyof typeof Ionicons.glyphMap {
  if (label?.includes('비')) return 'rainy-outline';
  if (label?.includes('눈')) return 'snow-outline';
  if (label?.includes('흐림')) return 'cloud-outline';
  return 'partly-sunny-outline';
}

function eventLocationMeta(event: CalendarEvent) {
  if (!event.location) return '';
  const resolved = typeof event.locationLat === 'number' && typeof event.locationLng === 'number';
  const selectedLocationName = event.locationRegion ?? event.locationCity ?? event.location;
  return resolved ? `선택 장소 : ${selectedLocationName} 기준` : `입력 장소 : ${event.location} · 현재 지역 기준`;
}

function MetricChip({
  icon,
  label,
  tone,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: string;
  value: string;
}) {
  return (
    <View style={styles.calendarMetricChip}>
      <Ionicons color={tone} name={icon} size={14} />
      <View>
        <Text style={styles.calendarMetricChipLabel}>{label}</Text>
        <Text style={[styles.calendarMetricChipValue, { color: tone }]}>{value}</Text>
      </View>
    </View>
  );
}

export function CalendarDaySheet({
  accentTone,
  events,
  isExpanded = false,
  onDismiss,
  onEditEvent,
  onExpandStateChange,
  onRemoveEvent,
  pm10,
  riskByEvent,
  selectedDate,
  style,
  temperature,
  todayDateLabel,
  weatherRisks = [],
  weatherLabel,
}: Props) {
  const dragHandlers = useCalendarDaySheetDrag({ isExpanded, onDismiss, onExpandStateChange });

  return (
    <Animated.View style={[styles.calendarDaySheet, style]}>
      <View style={styles.calendarDaySheetDragArea} {...dragHandlers}>
        <View style={styles.calendarSelectionHandle} />
      </View>
      <View style={styles.calendarSelectionTopRow}>
        <View style={styles.calendarSelectionTitleGroup}>
          <Text style={[styles.calendarSelectionDateText, { color: selectedDate === todayDateLabel ? accentTone : '#141821' }]}>
            {selectedDate === todayDateLabel ? TEXT.today : formatSelectedDateTitle(selectedDate)}
          </Text>
          <Text style={styles.calendarSelectionSubText}>{formatDateDisplay(selectedDate)}</Text>
        </View>
        <View style={styles.calendarSelectionWeatherRow}>
          {typeof pm10 === 'number' && (
            <MetricChip icon="leaf-outline" label="미세먼지" tone={accentTone} value={`${Math.round(pm10)}㎍/m³`} />
          )}
          {typeof temperature === 'number' && (
            <MetricChip icon="thermometer-outline" label="기온" tone="#c58a19" value={`${Math.round(temperature)}°`} />
          )}
          <MetricChip icon={weatherIcon(weatherLabel)} label="날씨" tone="#2f80ed" value={weatherLabel || '확인 중'} />
        </View>
      </View>
      {weatherRisks.length > 0 && (
        <View style={styles.calendarWeatherRiskRow}>
          {weatherRisks.map((risk) => (
            <View key={risk.key} style={[styles.calendarWeatherRiskPill, { backgroundColor: `${risk.tone}14`, borderColor: `${risk.tone}55` }]}>
              <Ionicons color={risk.tone} name={risk.icon} size={13} />
              <Text style={[styles.calendarWeatherRiskText, { color: risk.tone }]}>{risk.label}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.calendarSelectionDivider} />

      <ScrollView
        style={[styles.calendarDaySheetList, isExpanded && styles.calendarDaySheetListExpanded]}
        contentContainerStyle={styles.calendarDaySheetListContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={events.length > 1}
      >
        {events.length === 0 ? (
          <View style={styles.calendarSelectionEmptyRow}>
            <View style={[styles.calendarSelectionEmptyBar, { backgroundColor: accentTone }]} />
            <View style={styles.calendarEventBody}>
              <Text style={styles.calendarSelectionEmptyTitle}>{TEXT.emptyTitle}</Text>
              <Text style={styles.calendarEventMeta}>{TEXT.emptyDesc}</Text>
            </View>
          </View>
        ) : events.map((event) => {
          const risk = riskByEvent?.[event.id];
          const tone = risk?.tone ?? accentTone;
          return (
            <View key={event.id} style={styles.calendarEventRow}>
              <View style={[styles.calendarEventIcon, { backgroundColor: `${tone}14` }]}>
                <Ionicons color={tone} name={risk?.icon ?? eventIcon(event)} size={18} />
              </View>
              <View style={styles.calendarEventBody}>
                <Text style={styles.calendarEventTitle}>{event.title}</Text>
                <Text style={styles.calendarEventMeta}>
                  {eventDateLabel(event)} {event.time}{event.endTime ? `~${event.endTime}` : ''} · {activityLabel(event)}
                </Text>
                {!!eventLocationMeta(event) && <Text style={styles.calendarEventMeta}>{eventLocationMeta(event)}</Text>}
                {!!risk?.desc && <Text style={styles.calendarEventMemo}>{risk.desc}</Text>}
                {!!event.memo && <Text style={styles.calendarEventMemo}>{event.memo}</Text>}
              </View>
              <View style={styles.calendarBadgeStack}>
                {eventRangeLength(event) > 1 && <Text style={[styles.calendarGuideBadge, { backgroundColor: '#eef5ff', color: '#2f80ed' }]}>{`${eventRangeLength(event)}${TEXT.day}`}</Text>}
                <Text style={[styles.calendarGuideBadge, { backgroundColor: `${tone}14`, color: tone }]}>{risk?.badge ?? impactLabel(event)}</Text>
                <Text style={styles.calendarGuideBadge}>{activityLabel(event)}</Text>
              </View>
              <Pressable
                accessibilityLabel={`${event.title} 일정 편집`}
                onPress={() => onEditEvent?.(event)}
                style={({ pressed }) => [styles.calendarIconButton, pressed && styles.pressedFeedback]}
              >
                <Ionicons color="#687180" name="create-outline" size={17} />
              </Pressable>
              <Pressable
                accessibilityLabel={`${event.title} 일정 삭제`}
                onPress={() => onRemoveEvent(event.id)}
                style={({ pressed }) => [styles.calendarIconButton, pressed && styles.pressedFeedback]}
              >
                <Ionicons color="#8a94a3" name="trash-outline" size={17} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}
