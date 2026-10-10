import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import Reanimated, { FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { ACTIVITY_WEATHER_ICONS, activityForecastColor } from '../../features/dashboard/activityWeatherIcons';
import { activityForecastLabel, activityWeatherKind } from '../../features/dashboard/homeActivityGuidePresenter';
import { styles } from '../../styles/appStyles';
import { bauhausColors, textColors } from '../../theme/bauhaus';
import { AppActionIcon } from '../shared/AppActionIcon';
import { WeatherIcon, weatherIconKind } from '../shared/WeatherIcon';
import type { CalendarEvent, OutfitFigure, OutfitSensitivity } from '../../types/dust';
import { OutfitCardContainer, type OutfitFallbackLocation } from '../outfit/OutfitCard';
import { eventDateLabel, eventRangeLength, formatDateDisplay, formatSelectedDateTitle } from './calendarUtils';
import type { CalendarRiskResult } from './calendarRiskEvaluator';
import type { CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { useCalendarDaySheetDrag } from './useCalendarDaySheetDrag';

const TEXT = {
  adjust: '주의',
  day: '일',
  emptyTitle: '이 날은 일정이 없어요',
  good: '좋음',
  indoor: '실내',
  move: '이동',
  outdoor: '실외',
  today: '오늘',
};

type Props = {
  accentTone: string;
  onAddEvent?: () => void;
  events: CalendarEvent[];
  isExpanded?: boolean;
  onDismiss: () => void;
  onEditEvent?: (event: CalendarEvent) => void;
  onExpandStateChange?: (expanded: boolean) => void;
  onRemoveEvent: (event: CalendarEvent) => void;
  outfitEnabled: boolean;
  outfitFallbackLocation?: OutfitFallbackLocation;
  outfitFigure: OutfitFigure;
  outfitSensitivity: OutfitSensitivity;
  pm10?: number;
  riskByEvent?: Record<string, CalendarRiskResult>;
  selectedDate: string;
  style?: any;
  temperature?: number;
  todayDateLabel: string;
  weatherRisks?: CalendarWeatherRiskIndicator[];
  weatherLabel?: string;
};

function activityLabel(event: CalendarEvent) {
  if (event.activityType === 'indoor') return TEXT.indoor;
  if (event.activityType === 'transit') return TEXT.move;
  return TEXT.outdoor;
}

function impactLabel(event: CalendarEvent) {
  if (event.sensitive && event.activityType === 'outdoor') return TEXT.adjust;
  return TEXT.good;
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
  weatherKind,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: string;
  value: string;
  weatherKind?: import('../shared/WeatherIcon').WeatherIconKind;
}) {
  return (
    <View accessibilityLabel={`${label} ${value}`} accessible style={styles.calendarMetricChip}>
      {weatherKind ? <WeatherIcon kind={weatherKind} size={18} /> : !!icon && <Ionicons color={tone} name={icon} size={14} />}
      <Text style={[styles.calendarMetricChipValue, { color: tone }]}>
        <Text style={styles.calendarMetricChipLabel}>{label} </Text>
        {value}
      </Text>
    </View>
  );
}

export function CalendarDaySheet({
  accentTone,
  events,
  isExpanded = false,
  onAddEvent,
  onDismiss,
  onEditEvent,
  onExpandStateChange,
  onRemoveEvent,
  outfitEnabled,
  outfitFallbackLocation,
  outfitFigure,
  outfitSensitivity,
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
  // 옷차림 카드는 기본으로 접어 두고, 펼친 일정만 추천을 불러옵니다(일정마다 요청이 가지 않게).
  const [openOutfitIds, setOpenOutfitIds] = useState<string[]>([]);
  const toggleOutfit = (eventId: string) => {
    setOpenOutfitIds((current) => (current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]));
  };

  return (
    <Animated.View style={[styles.calendarDaySheet, style]}>
      <View style={styles.calendarDaySheetDragArea} {...dragHandlers}>
        <View style={styles.calendarSelectionHandle} />
      </View>
      <View style={styles.calendarSelectionTopRow}>
        <View style={styles.calendarSelectionTitleGroup}>
          <Text style={[styles.calendarSelectionDateText, { color: selectedDate === todayDateLabel ? accentTone : textColors.primary }]}>
            {selectedDate === todayDateLabel ? TEXT.today : formatSelectedDateTitle(selectedDate)}
          </Text>
          <Text style={styles.calendarSelectionSubText}>{formatDateDisplay(selectedDate)}</Text>
        </View>
        <View style={styles.calendarSelectionWeatherRow}>
          {typeof pm10 === 'number' && (
            <MetricChip icon="leaf" label="미세먼지" tone={accentTone} value={`${Math.round(pm10)}㎍/m³`} />
          )}
          {typeof temperature === 'number' && (
            <MetricChip icon="thermometer" label="기온" tone={bauhausColors.amber} value={`${Math.round(temperature)}°`} />
          )}
          {/* 날씨 아이콘은 일정 줄과 같은 채운 아이콘 세트를 씁니다. */}
          <MetricChip
            weatherKind={weatherIconKind(weatherLabel)}
            label="날씨"
            tone={weatherIconKind(weatherLabel) === 'clear' ? '#F3B43F' : bauhausColors.blue}
            value={weatherLabel || '확인 중'}
          />
        </View>
      </View>
      {weatherRisks.length > 0 && (
        <View style={styles.calendarWeatherRiskRow}>
          {weatherRisks.map((risk) => (
            <View key={risk.key} style={[styles.calendarWeatherRiskPill, { backgroundColor: `${risk.tone}14`, borderColor: `${risk.tone}55` }]}>
              {risk.imageKind ? <WeatherIcon kind={risk.imageKind} size={15} /> : <Ionicons color={risk.tone} name={risk.icon} size={13} />}
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
            </View>
            {onAddEvent && (
              <Pressable
                accessibilityLabel="이 날짜에 일정 추가"
                accessibilityRole="button"
                onPress={onAddEvent}
                style={({ pressed }) => [styles.calendarEmptyAddButton, pressed && styles.pressedFeedback]}
              >
                <Ionicons color={accentTone} name="add" size={17} />
                <Text style={[styles.calendarEmptyAddText, { color: accentTone }]}>일정 추가</Text>
              </Pressable>
            )}
          </View>
        ) : events.map((event, index) => {
          const risk = riskByEvent?.[event.id];
          const tone = risk?.tone ?? accentTone;
          // 홈 활동 가이드와 같은 기준: 아이콘은 그 일정 시간대 날씨, 예보는 한 줄로.
          const weatherKind = risk ? activityWeatherKind(risk) : 'unknown';
          const weatherIconStyle = ACTIVITY_WEATHER_ICONS[weatherKind];
          const forecastLabel = risk ? activityForecastLabel(risk) : '';
          return (
            // 날짜를 바꾸면 일정이 차례로 올라오며 나타나고, 지운 일정은 흐려지며 사라지면서 아래 일정이 그 자리로 올라옵니다.
            <Reanimated.View
              entering={FadeInDown.delay(Math.min(index, 5) * 50).duration(220).reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
              layout={LinearTransition.duration(200).reduceMotion(ReduceMotion.System)}
              key={event.id}
              style={styles.calendarEventGroup}
            >
              <View style={styles.calendarEventRow}>
                <View accessibilityLabel={forecastLabel || undefined} style={[styles.calendarEventIcon, { backgroundColor: weatherIconStyle.background }]}>
                  <WeatherIcon kind={weatherIconStyle.kind} size={30} />
                </View>
                <View style={styles.calendarEventBody}>
                  <Text style={styles.calendarEventTitle}>{event.title}</Text>
                  <Text style={styles.calendarEventMeta}>
                    {eventDateLabel(event)} {event.time}{event.endTime ? `~${event.endTime}` : ''} · {activityLabel(event)}
                  </Text>
                  {!!eventLocationMeta(event) && <Text style={styles.calendarEventMeta}>{eventLocationMeta(event)}</Text>}
                  {!!forecastLabel && <Text numberOfLines={1} style={[styles.calendarEventForecast, { color: activityForecastColor(weatherKind) }]}>{forecastLabel}</Text>}
                  {!!risk?.desc && <Text style={styles.calendarEventMemo}>{risk.desc}</Text>}
                  {!!event.memo && <Text style={styles.calendarEventMemo}>{event.memo}</Text>}
                </View>
                <View style={styles.calendarBadgeStack}>
                  {eventRangeLength(event) > 1 && <Text style={[styles.calendarGuideBadge, { backgroundColor: bauhausColors.blueSoft, color: bauhausColors.blue }]}>{`${eventRangeLength(event)}${TEXT.day}`}</Text>}
                  <Text style={[styles.calendarGuideBadge, { backgroundColor: `${tone}14`, color: tone }]}>{risk?.badge ?? impactLabel(event)}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`${event.title} 일정 편집`}
                  onPress={() => onEditEvent?.(event)}
                  style={({ pressed }) => [styles.calendarIconButton, pressed && styles.pressedFeedback]}
                >
                  <AppActionIcon name="edit" size={24} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`${event.title} 일정 삭제`}
                  onPress={() => onRemoveEvent(event)}
                  style={({ pressed }) => [styles.calendarIconButton, pressed && styles.pressedFeedback]}
                >
                  <AppActionIcon name="delete" size={24} />
                </Pressable>
              </View>
              {outfitEnabled && (
                <Pressable
                  accessibilityLabel={`${event.title} 옷차림 ${openOutfitIds.includes(event.id) ? '접기' : '보기'}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openOutfitIds.includes(event.id) }}
                  onPress={() => toggleOutfit(event.id)}
                  style={({ pressed }) => [styles.calendarOutfitToggle, pressed && styles.pressedFeedback]}
                >
                  <Text style={[styles.calendarOutfitToggleText, { color: accentTone }]}>{openOutfitIds.includes(event.id) ? '옷차림 접기' : '옷차림 보기'}</Text>
                  <Ionicons color={accentTone} name={openOutfitIds.includes(event.id) ? 'chevron-up' : 'chevron-down'} size={15} />
                </Pressable>
              )}
              {outfitEnabled && openOutfitIds.includes(event.id) && (
                <Reanimated.View entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}>
                  <OutfitCardContainer enabled={outfitEnabled} event={event} fallbackLocation={outfitFallbackLocation} figure={outfitFigure} sensitivity={outfitSensitivity} />
                </Reanimated.View>
              )}
            </Reanimated.View>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}
