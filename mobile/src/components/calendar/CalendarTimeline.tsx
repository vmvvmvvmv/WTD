import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import Reanimated, { FadeIn, LayoutAnimationConfig, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { bauhausColors } from '../../theme/bauhaus';
import type { CalendarEvent } from '../../types/calendar';
import { CalendarDayCell } from './CalendarDayCell';
import { useCalendarSlide } from './useCalendarSlide';
import { CalendarPeriodHeader } from './CalendarPeriodHeader';
import { buildCalendarEventCounts, buildCalendarEventLanes } from './calendarLayout';
import { buildTimelineBlocks, isMultiDayEvent } from './calendarTimelineLayout';
import { parseDateParts, weekdayLabels } from './calendarUtils';
import type { CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { accentTone } from '../../theme/appTheme';

const HOUR_HEIGHT = 56;
const GUTTER_WIDTH = 44;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Props = {
  // 1개면 일 보기, 7개면 주 보기.
  dates: string[];
  events: CalendarEvent[];
  getEventTone: (event: CalendarEvent) => string;
  onGoToday?: () => void;
  onMove: (offset: number) => void;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  title: string;
  todayDateLabel: string;
  transitionDirection: number;
  weatherRiskByDate?: Record<string, CalendarWeatherRiskIndicator | undefined>;
};

function nowMinute() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// 삼성 캘린더처럼: 위에 날짜(와 여러 날 일정 막대), 아래에 0~24시 시간표.
export function CalendarTimeline({
  dates,
  events,
  getEventTone,
  onGoToday,
  onMove,
  onSelectDate,
  selectedDate,
  title,
  todayDateLabel,
  transitionDirection,
  weatherRiskByDate,
}: Props) {
  const isWeek = dates.length > 1;
  const { animatedStyle, swipeHandlers } = useCalendarSlide(title, transitionDirection, onMove);
  const scrollRef = useRef<ScrollView>(null);
  const [minuteNow, setMinuteNow] = useState(nowMinute);

  useEffect(() => {
    const timer = setInterval(() => setMinuteNow(nowMinute()), 60000);
    return () => clearInterval(timer);
  }, []);

  const cells = useMemo(() => dates.map((date) => ({ date, day: parseDateParts(date).day, inMonth: true })), [dates]);
  const multiDayEvents = useMemo(() => events.filter(isMultiDayEvent), [events]);
  const allDayItems = useMemo(() => buildCalendarEventLanes(cells, multiDayEvents), [cells, multiDayEvents]);
  const allDayCounts = useMemo(() => buildCalendarEventCounts(cells, multiDayEvents), [cells, multiDayEvents]);
  const blocksByDate = useMemo(
    () => Object.fromEntries(dates.map((date) => [date, buildTimelineBlocks(date, events)])),
    [dates, events],
  );

  // 오늘이면 지금 1시간 전, 아니면 그 기간 첫 일정 1시간 전(없으면 아침 7시)부터 보이게.
  const firstEventMinute = Math.min(...dates.flatMap((date) => blocksByDate[date].map((block) => block.startMinute)));
  useEffect(() => {
    const startHour = dates.includes(todayDateLabel)
      ? Math.floor(nowMinute() / 60) - 1
      : Number.isFinite(firstEventMinute) ? Math.floor(firstEventMinute / 60) - 1 : 7;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ animated: false, y: Math.max(0, startHour) * HOUR_HEIGHT }), 0);
    return () => clearTimeout(timer);
    // 기간이 바뀔 때만 다시 맞춥니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  return (
    <View style={styles.calendarMonthCard}>
      <CalendarPeriodHeader onGoToday={onGoToday} onMove={onMove} title={title} unitLabel={isWeek ? '주' : '날'} />
      <Animated.View style={[styles.calendarTimelineStage, animatedStyle]} {...swipeHandlers}>
        {isWeek ? (
          <>
            <View style={[styles.calendarWeekRow, { paddingLeft: GUTTER_WIDTH }]}>
              {weekdayLabels.map((day, index) => (
                <Text key={day} style={[styles.calendarWeekText, index === 0 && styles.calendarWeekTextSunday, index === 6 && styles.calendarWeekTextSaturday]}>{day}</Text>
              ))}
            </View>
            <View style={[styles.calendarGridWeekRow, styles.calendarTimelineDayRow]}>
              {cells.map((cell, index) => (
                <CalendarDayCell
                  cellIndex={index}
                  compact
                  date={cell.date}
                  day={cell.day}
                  eventCount={allDayCounts[cell.date] ?? 0}
                  eventItems={allDayItems[cell.date] ?? []}
                  getEventTone={getEventTone}
                  isRangeAnchor={false}
                  isSelected={cell.date === selectedDate}
                  isToday={cell.date === todayDateLabel}
                  key={cell.date}
                  onLongPress={() => onSelectDate(cell.date)}
                  onPress={() => onSelectDate(cell.date)}
                  range={null}
                  style={styles.calendarTimelineDayCell}
                  weatherRisk={weatherRiskByDate?.[cell.date]}
                />
              ))}
            </View>
          </>
        ) : (
          (allDayItems[dates[0]] ?? []).some(Boolean) && (
            <View style={styles.calendarTimelineAllDay}>
              {(allDayItems[dates[0]] ?? []).filter((event): event is CalendarEvent => !!event).map((event) => (
                <Pressable
                  accessibilityLabel={`${event.title} 일정`}
                  key={event.id}
                  onPress={() => onSelectDate(dates[0])}
                  style={({ pressed }) => [styles.calendarTimelineAllDayBar, { backgroundColor: event.sensitive ? bauhausColors.amber : getEventTone(event) }, pressed && styles.pressedFeedback]}
                >
                  <Text numberOfLines={1} style={styles.calendarTimelineBlockTitle}>{event.title}</Text>
                </Pressable>
              ))}
            </View>
          )
        )}

        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={styles.calendarTimelineScroll}>
          <View style={{ height: 24 * HOUR_HEIGHT }}>
            {/* 목록·편집 화면처럼 24시간 표기(18:00 → 18). */}
            {HOURS.map((hour) => (
              <View key={hour} pointerEvents="none" style={[styles.calendarTimelineHour, { height: HOUR_HEIGHT, top: hour * HOUR_HEIGHT }]}>
                <View style={[styles.calendarTimelineHourLabel, { width: GUTTER_WIDTH }]}>
                  {hour > 0 && <Text style={styles.calendarTimelineHourText}>{hour}</Text>}
                </View>
                <View style={styles.calendarTimelineHourLine} />
              </View>
            ))}

            {/* 처음 그릴 때는 일정이 나타나는 효과를 건너뛰고, 그 뒤 일정을 추가·수정해 칸이 바뀔 때만 움직입니다. */}
            <LayoutAnimationConfig skipEntering>
            <View style={[styles.calendarTimelineColumns, { left: GUTTER_WIDTH }]}>
              {dates.map((date) => (
                <Pressable
                  accessibilityLabel={`${date} 시간표`}
                  key={date}
                  onPress={() => onSelectDate(date)}
                  style={[styles.calendarTimelineColumn, isWeek && date === selectedDate && { backgroundColor: `${accentTone}0d` }]}
                >
                  <View pointerEvents="box-none" style={[styles.calendarTimelineBlockArea, { right: isWeek ? 2 : 28 }]}>
                  {blocksByDate[date].map((block) => {
                    const tone = block.event.sensitive ? bauhausColors.amber : getEventTone(block.event);
                    const height = Math.max(22, ((block.endMinute - block.startMinute) / 60) * HOUR_HEIGHT - 2);
                    // 같은 시간대 일정이 늘거나 줄면 칸 위치·폭이 바뀌는데, 기존 일정이 옆으로 미끄러지며 자리를 내줍니다.
                    return (
                      <Reanimated.View
                        entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
                        key={block.event.id}
                        layout={LinearTransition.duration(240).reduceMotion(ReduceMotion.System)}
                        style={{
                          height,
                          left: `${(block.lane / block.lanes) * 100}%`,
                          position: 'absolute',
                          top: (block.startMinute / 60) * HOUR_HEIGHT + 1,
                          width: `${100 / block.lanes}%`,
                        }}
                      >
                        <Pressable
                          accessibilityLabel={`${block.event.time} ${block.event.title}`}
                          onPress={() => onSelectDate(date)}
                          style={({ pressed }) => [
                            styles.calendarTimelineBlock,
                            { backgroundColor: tone, bottom: 0, left: 0, right: 0, top: 0 },
                            pressed && styles.pressedFeedback,
                          ]}
                        >
                          <Text numberOfLines={height >= 40 ? 2 : 1} style={styles.calendarTimelineBlockTitle}>{block.event.title}</Text>
                          {height >= 40 && !isWeek && <Text numberOfLines={1} style={styles.calendarTimelineBlockTime}>{block.event.time}{block.event.endTime ? ` ~ ${block.event.endTime}` : ''}</Text>}
                        </Pressable>
                      </Reanimated.View>
                    );
                  })}
                  </View>
                  {date === todayDateLabel && (
                    <View pointerEvents="none" style={[styles.calendarTimelineNow, { top: (minuteNow / 60) * HOUR_HEIGHT }]}>
                      <View style={styles.calendarTimelineNowDot} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
            </LayoutAnimationConfig>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}
