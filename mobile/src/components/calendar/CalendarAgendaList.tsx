import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Reanimated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { useHolidayNames } from '../../features/calendar/useHolidayNames';
import { styles } from '../../styles/appStyles';
import { bauhausColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/calendar';
import { isMultiDayEvent } from './calendarTimelineLayout';
import { parseDateParts, weekdayLabels } from './calendarUtils';

type Props = {
  events: CalendarEvent[];
  getEventTone: (event: CalendarEvent) => string;
  onSelectDate: (date: string) => void;
  todayDateLabel: string;
};

function sectionTitle(date: string, todayDateLabel: string) {
  const { day, month, year } = parseDateParts(date);
  const weekday = weekdayLabels[new Date(year, month, day).getDay()];
  return `${month + 1}월 ${day}일 (${weekday})${year !== parseDateParts(todayDateLabel).year ? ` · ${year}년` : ''}`;
}

function timeText(event: CalendarEvent) {
  if (isMultiDayEvent(event)) {
    const start = parseDateParts(event.date);
    const end = parseDateParts(event.endDate ?? event.date);
    return `${start.month + 1}월 ${start.day}일 ~ ${end.month + 1}월 ${end.day}일`;
  }
  return event.endTime ? `${event.time} ~ ${event.endTime}` : event.time;
}

// 삼성 캘린더 '일정' 보기처럼 모든 일정을 날짜별로 나열하고, 오늘 위치에서 엽니다(위로 올리면 지난 일정).
export function CalendarAgendaList({ events, getEventTone, onSelectDate, todayDateLabel }: Props) {
  const holidays = useHolidayNames(Number(todayDateLabel.slice(0, 4)));
  const scrollRef = useRef<ScrollView>(null);
  const hasScrolledRef = useRef(false);

  const sections = useMemo(() => {
    const byDate = new Map<string, CalendarEvent[]>([[todayDateLabel, []]]);
    events.forEach((event) => {
      // 오늘 진행 중인 여러 날 일정은 오늘 칸에 둡니다.
      const isOngoing = event.date < todayDateLabel && (event.endDate ?? event.date) >= todayDateLabel;
      const date = isOngoing ? todayDateLabel : event.date;
      byDate.set(date, [...(byDate.get(date) ?? []), event]);
    });
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, todayDateLabel]);

  const todayIndex = sections.findIndex(([date]) => date === todayDateLabel);

  return (
    <ScrollView contentContainerStyle={styles.calendarAgendaContent} ref={scrollRef}>
      {sections.map(([date, dayEvents], sectionIndex) => {
        const isToday = date === todayDateLabel;
        // 오늘 근처 몇 묶음만 차례로 살짝 올라오며 나타납니다(너무 길게 기다리지 않게).
        const delay = Math.max(0, Math.min(6, sectionIndex - todayIndex + 2)) * 40;
        return (
          <Reanimated.View
            entering={FadeInDown.duration(260).delay(delay).reduceMotion(ReduceMotion.System)}
            key={date}
            onLayout={isToday ? (layoutEvent) => {
              if (hasScrolledRef.current) return;
              hasScrolledRef.current = true;
              scrollRef.current?.scrollTo({ animated: false, y: layoutEvent.nativeEvent.layout.y });
            } : undefined}
          >
            <View style={styles.calendarAgendaHeader}>
              <Text style={[styles.calendarAgendaHeaderText, isToday && styles.calendarAgendaHeaderToday]}>{sectionTitle(date, todayDateLabel)}</Text>
              {!!holidays[date] && <Text style={[styles.calendarAgendaHeaderText, styles.calendarHolidayText]}>{holidays[date]}</Text>}
              {isToday && <Text style={styles.calendarAgendaTodayTag}>오늘</Text>}
            </View>
            {!dayEvents.length && <Text style={styles.calendarAgendaEmptyText}>오늘 일정이 없어요</Text>}
            {dayEvents.map((event) => {
              const tone = event.sensitive ? bauhausColors.amber : getEventTone(event);
              return (
                <Pressable
                  accessibilityLabel={`${event.title} 일정`}
                  key={event.id}
                  onPress={() => onSelectDate(date)}
                  style={({ pressed }) => [styles.calendarAgendaItem, { backgroundColor: `${tone}14` }, pressed && styles.pressedFeedback]}
                >
                  <Ionicons color={tone} name="calendar-clear" size={18} style={styles.calendarAgendaIcon} />
                  <View style={styles.calendarAgendaBody}>
                    <Text numberOfLines={1} style={styles.calendarAgendaTitle}>{event.title}</Text>
                    <Text numberOfLines={1} style={styles.calendarAgendaMeta}>{timeText(event)}{event.location ? ` · ${event.location}` : ''}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Reanimated.View>
        );
      })}
    </ScrollView>
  );
}
