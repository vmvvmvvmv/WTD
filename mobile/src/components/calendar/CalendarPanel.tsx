import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Alert, Animated, BackHandler, InteractionManager, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Reanimated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, ReduceMotion } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent } from '../../types/calendar';
import type { HourlyDustItem, PredictionResponse } from '../../types/dust';
import type { OutfitFigure, OutfitSensitivity } from '../../types/outfit';
import type { WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/weather';
import { CalendarAgendaList } from './CalendarAgendaList';
import { CalendarDaySheet } from './CalendarDaySheet';
import { CalendarEventEditor } from './CalendarEventEditor';
import { CalendarMemoSheet } from './CalendarMemoSheet';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarTimeline } from './CalendarTimeline';
import { CalendarViewTabs } from './CalendarViewTabs';
import { CalendarYearGrid } from './CalendarYearGrid';
import { buildCalendarRiskByEvent, buildSelectedCalendarForecast, type CalendarLocationForecast } from './calendarForecast';
import { buildCalendarEventCounts, buildCalendarEventLanes } from './calendarLayout';
import type { CalendarLocationCandidate } from './calendarLocation';
import { addDays, buildMonthCells, buildWeekCells, dayLabel, eventTone, isDateInEventRange, monthLabel, parseDateParts, weekLabel } from './calendarUtils';
import { dailyPrecipitationIndicator, dailyWeatherByDate as buildDailyWeatherByDate, topWeatherRiskForDate, weatherRiskIndicators, type CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { withoutFollowingOccurrences } from './calendarRepeat';
import { recentLocationCandidates } from './calendarLocation';
import { confirmCalendarEventRemoval } from './confirmCalendarEventRemoval';
import { useCalendarDaySheet } from './useCalendarDaySheet';
import { useCalendarEventDraft } from './useCalendarEventDraft';
import { useCalendarNavigation, VIEW_MODES } from './useCalendarNavigation';
import { accentTone } from '../../theme/appTheme';

export function CalendarPanel({
  currentPm10,
  defaultLocation,
  events,
  eventLocationForecasts,
  hourlyItems,
  mapPickerUrl,
  onAddEvent,
  onAddEvents,
  onOpenedAddForToday,
  openAddForToday,
  onRemoveEvent,
  onRemoveFollowingEvents,
  onUpdateEvent,
  onUpdateEventSeries,
  outfitEnabled,
  outfitFigure,
  outfitSensitivity,
  prediction,
  sensitiveMode = false,
  todayDateLabel,
  weather,
  weatherHourlyItems,
  weatherMidTermItems,
}: {
  currentPm10?: number;
  defaultLocation?: CalendarLocationCandidate | null;
  events: CalendarEvent[];
  eventLocationForecasts?: Record<string, CalendarLocationForecast>;
  hourlyItems?: HourlyDustItem[];
  mapPickerUrl?: string;
  // true로 열리면 오늘 날짜 창과 일정 추가 메뉴를 펼친 채로 시작하고 onOpenedAddForToday를 부릅니다.
  onOpenedAddForToday?: () => void;
  openAddForToday?: boolean;
  onAddEvent: (event: CalendarEvent) => void;
  onAddEvents?: (events: CalendarEvent[]) => void;
  onRemoveEvent: (eventId: string) => void;
  onRemoveFollowingEvents: (event: CalendarEvent) => void;
  onUpdateEvent?: (event: CalendarEvent) => void;
  onUpdateEventSeries?: (event: CalendarEvent) => void;
  outfitEnabled: boolean;
  outfitFigure: OutfitFigure;
  outfitSensitivity: OutfitSensitivity;
  prediction?: PredictionResponse | null;
  sensitiveMode?: boolean;
  todayDateLabel: string;
  weather?: WeatherState | null;
  weatherHourlyItems?: WeatherHourlyItem[];
  weatherMidTermItems?: WeatherMidTermItem[];
}) {
  const windowSize = useWindowDimensions();
  const draft = useCalendarEventDraft(todayDateLabel, defaultLocation);
  const [panelHeight, setPanelHeight] = useState(windowSize.height);
  const sheet = useCalendarDaySheet(panelHeight);
  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  // Android 뒤로가기: 펼친 일정 추가 버튼 → 날짜 시트 순서로 닫고, 둘 다 닫혀 있으면 앱 쪽 처리(홈으로)로 넘깁니다.
  useEffect(() => {
    if (!isAddMenuOpen && !sheet.isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isAddMenuOpen) setIsAddMenuOpen(false);
      else sheet.setIsOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [isAddMenuOpen, sheet.isOpen, sheet.setIsOpen]);

  // AI 일정 등록으로 추가한 뒤 잠깐 띄우는 알림. '되돌리기'를 누르면 방금 넣은 일정을 모두 뺍니다.
  const [addedNotice, setAddedNotice] = useState<{ ids: string[]; key: number } | null>(null);
  // 일정을 지운 뒤 5초 동안 띄우는 알림. '되돌리기'를 누르면 지운 일정을 그대로 되살립니다.
  const [removedNotice, setRemovedNotice] = useState<{ events: CalendarEvent[]; key: number } | null>(null);
  useEffect(() => {
    if (!removedNotice) return;
    const timer = setTimeout(() => setRemovedNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [removedNotice]);
  useEffect(() => {
    if (!addedNotice) return;
    const timer = setTimeout(() => setAddedNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [addedNotice]);
  // 메모 미리보기에서 고치려고 연 일정이 저장되면, 미리보기에서 그 일정을 빼려고 부릅니다.
  const memoEditSavedRef = useRef<(() => void) | null>(null);
  const {
    changeViewMode,
    goToday,
    movePeriod,
    selectedDate,
    selectYearMonth,
    setSelectedDate,
    transitionDirection,
    viewAnimatedStyle,
    viewMode,
    visibleMonth,
    weekStart,
  } = useCalendarNavigation(todayDateLabel, sheet.close);
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [events],
  );
  const selectedEvents = useMemo(
    () => sortedEvents.filter((event) => isDateInEventRange(selectedDate, event)),
    [selectedDate, sortedEvents],
  );
  const monthCells = useMemo(() => {
    if (viewMode === 'week') return buildWeekCells(weekStart);
    if (viewMode === 'day') return [{ date: selectedDate, day: parseDateParts(selectedDate).day, inMonth: true }];
    return buildMonthCells(visibleMonth.year, visibleMonth.month);
  }, [selectedDate, viewMode, visibleMonth.month, visibleMonth.year, weekStart]);
  const timelineDates = useMemo(() => monthCells.flatMap((cell) => (cell ? [cell.date] : [])), [monthCells]);
  const yearEventDates = useMemo(() => {
    const dates = new Set<string>();
    if (viewMode !== 'year') return dates;
    const yearPrefix = `${visibleMonth.year}-`;
    sortedEvents.forEach((event) => {
      const end = event.endDate ?? event.date;
      for (let date = event.date, guard = 0; date <= end && guard < 366; date = addDays(date, 1), guard += 1) {
        if (date.startsWith(yearPrefix)) dates.add(date);
      }
    });
    return dates;
  }, [sortedEvents, viewMode, visibleMonth.year]);
  const eventCountByDate = useMemo(() => buildCalendarEventCounts(monthCells, sortedEvents), [monthCells, sortedEvents]);
  const eventItemsByDate = useMemo(() => buildCalendarEventLanes(monthCells, sortedEvents), [monthCells, sortedEvents]);

  // Calendar forecasts are merged once here so the grid, bottom sheet, and risk labels use the same data source order.
  const forecastContext = useMemo(() => ({
    currentPm10,
    dustItems: hourlyItems,
    eventLocationForecasts,
    prediction,
    sensitiveMode,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  }), [currentPm10, eventLocationForecasts, hourlyItems, prediction, sensitiveMode, todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems]);
  const selectedForecast = useMemo(
    () => buildSelectedCalendarForecast(selectedDate, forecastContext),
    [forecastContext, selectedDate],
  );
  const selectedRiskByEvent = useMemo(
    () => buildCalendarRiskByEvent(selectedEvents, forecastContext),
    [forecastContext, selectedEvents],
  );
  // 달 전체 날씨 배지 계산은 무거워서, 화면 전환 애니메이션이 끝난 뒤에 합니다(처음 열 때 덜컹거림 방지).
  const [isTransitionDone, setIsTransitionDone] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setIsTransitionDone(true));
    return () => task.cancel();
  }, []);
  // 달력 칸 구석 날씨 배지와, 비·눈·천둥이 예보된 일정('일정id:날짜') 목록. 일정 선 앞에 우산을 그립니다.
  const { rainyEventKeys, weatherRiskByDate } = useMemo(() => {
    const next: Record<string, CalendarWeatherRiskIndicator> = {};
    const rainy = new Set<string>();
    if (!isTransitionDone) return { rainyEventKeys: rainy, weatherRiskByDate: next };
    monthCells.forEach((cell) => {
      if (!cell) return;
      const dayEvents = sortedEvents
        .filter((event) => isDateInEventRange(cell.date, event))
        .map((event) => ({
          ...event,
          date: cell.date,
          endDate: cell.date,
          endTime: cell.date === (event.endDate ?? event.date) ? event.endTime : '23:59',
          id: `${event.id}:${cell.date}`,
          time: cell.date === event.date ? event.time : '00:00',
        }));
      const dayRiskByEvent = buildCalendarRiskByEvent(dayEvents, forecastContext);
      const risk = topWeatherRiskForDate(cell.date, dayEvents, dayRiskByEvent);
      if (risk) next[cell.date] = risk;
      dayEvents.forEach((event) => {
        if (weatherRiskIndicators(dayRiskByEvent[event.id]).some((indicator) => indicator.imageKind === 'rain' || indicator.imageKind === 'snow' || indicator.imageKind === 'thunder')) {
          rainy.add(event.id);
        }
      });
    });
    return { rainyEventKeys: rainy, weatherRiskByDate: next };
  }, [forecastContext, isTransitionDone, monthCells, sortedEvents]);
  const dailyWeatherByDate = useMemo(
    () => buildDailyWeatherByDate({ todayDateLabel, weatherHourlyItems, weatherMidTermItems }),
    [todayDateLabel, weatherHourlyItems, weatherMidTermItems],
  );
  const selectedWeatherRisks = useMemo(
    () => [
      ...selectedEvents.flatMap((event) => weatherRiskIndicators(selectedRiskByEvent[event.id])),
      dailyPrecipitationIndicator(dailyWeatherByDate[selectedDate]),
    ]
      .filter((indicator): indicator is CalendarWeatherRiskIndicator => !!indicator)
      .filter((indicator, index, items) => items.findIndex((item) => item.key === indicator.key) === index)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3),
    [dailyWeatherByDate, selectedDate, selectedEvents, selectedRiskByEvent],
  );

  const selectDate = (nextDate: string, options?: { openSheet?: boolean }) => {
    setSelectedDate(nextDate);
    sheet.setIsOpen(options?.openSheet !== false);
  };
  // 목록의 '+', 달력 날짜 길게 누르기: 그 날짜로 바로 직접·AI 일정 추가 메뉴를 엽니다.
  const openAddForDate = (date: string) => {
    selectDate(date, { openSheet: false });
    setIsAddMenuOpen(true);
  };

  // 홈 '오늘 일정' 카드에서 추가를 눌러 왔으면 화면이 자리 잡은 뒤 오늘 창을 열고, 창이 다 올라오면 직접·AI 등록 메뉴를 펼칩니다.
  // 캘린더 화면은 탭을 열 때마다 새로 만들어지므로 처음 한 번만 봅니다.
  useEffect(() => {
    if (!openAddForToday) return;
    onOpenedAddForToday?.();
    const openSheet = setTimeout(() => selectDate(todayDateLabel), 450);
    const openMenu = setTimeout(() => setIsAddMenuOpen(true), 750);
    return () => {
      clearTimeout(openSheet);
      clearTimeout(openMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveEvent = () => {
    draft.saveEvent({
      onAddEvent,
      onAddEvents,
      onSaved: (date) => {
        memoEditSavedRef.current?.();
        memoEditSavedRef.current = null;
        setSelectedDate(date);
        sheet.setIsOpen(true);
      },
      onUpdateEvent,
      onUpdateEventSeries,
      selectedDate,
    });
  };

  const addMemoEvents = (added: CalendarEvent[]) => {
    if (added.length === 0) return;
    if (onAddEvents) onAddEvents(added);
    else added.forEach(onAddEvent);
    selectDate(added.map((event) => event.date).sort()[0]);
    setAddedNotice({ ids: added.map((event) => event.id), key: Date.now() });
  };

  const editMemoEvent = (event: CalendarEvent, onSaved: () => void) => {
    memoEditSavedRef.current = onSaved;
    draft.openEditorWithValues(event);
  };

  const closeEditor = () => {
    memoEditSavedRef.current = null;
    draft.closeEditor();
  };

  const memoRiskByEvent = (previewEvents: CalendarEvent[], previewForecasts: Record<string, CalendarLocationForecast>) => buildCalendarRiskByEvent(previewEvents, {
    currentPm10,
    eventLocationForecasts: { ...eventLocationForecasts, ...previewForecasts },
    hourlyItems,
    prediction,
    sensitiveMode,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  });

  // 한 번만 있는 일정은 묻지 않고 바로 지우고 '되돌리기'를 띄웁니다. 반복 일정은 '이 일정만 / 이후 모두'를 먼저 고릅니다.
  const recentLocations = useMemo(() => recentLocationCandidates(events), [events]);

  const removeEvent = (event: CalendarEvent) => {
    const removeOne = () => {
      onRemoveEvent(event.id);
      setAddedNotice(null);
      setRemovedNotice({ events: [event], key: Date.now() });
    };
    if (!event.repeatGroupId) {
      removeOne();
      return;
    }
    confirmCalendarEventRemoval(event, {
      removeFollowing: () => {
        const kept = new Set(withoutFollowingOccurrences(events, event));
        const removed = events.filter((item) => !kept.has(item));
        onRemoveFollowingEvents(event);
        setAddedNotice(null);
        setRemovedNotice({ events: removed, key: Date.now() });
      },
      removeOne,
    });
  };

  const editEvent = (event: CalendarEvent) => {
    if (!event.repeatGroupId) {
      draft.openEditorForEvent(event);
      return;
    }
    Alert.alert('\uBC18\uBCF5 \uC77C\uC815 \uD3B8\uC9D1', '\uC5B4\uB290 \uBC94\uC704\uB97C \uBC14\uAFC0\uAE4C\uC694?', [
      { style: 'cancel', text: '\uCDE8\uC18C' },
      { text: '\uC774 \uC77C\uC815\uB9CC', onPress: () => draft.openEditorForEvent(event, 'single') },
      { text: '\uBC18\uBCF5 \uC804\uCCB4', onPress: () => draft.openEditorForEvent(event, 'series') },
    ]);
  };

  return (
    <View onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)} style={styles.calendarPanel}>
      <Reanimated.View style={[styles.calendarFullStage, sheet.stageStyle]}>
        <CalendarViewTabs onChange={changeViewMode} tabs={VIEW_MODES} value={viewMode} />
        <Animated.View style={[styles.calendarViewStage, viewAnimatedStyle]}>
        {viewMode === 'list' && (
          <CalendarAgendaList
            events={sortedEvents}
            getEventTone={eventTone}
            onAddForDate={openAddForDate}
            onSelectDate={selectDate}
            todayDateLabel={todayDateLabel}
          />
        )}
        {(viewMode === 'day' || viewMode === 'week') && (
          <CalendarTimeline
            dates={timelineDates}
            events={sortedEvents}
            getEventTone={eventTone}
            onGoToday={goToday}
            onAddForDate={(date) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              openAddForDate(date);
            }}
            onMove={movePeriod}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
            title={viewMode === 'week' ? weekLabel(weekStart) : dayLabel(selectedDate)}
            todayDateLabel={todayDateLabel}
            transitionDirection={transitionDirection}
            dailyWeatherByDate={dailyWeatherByDate}
            weatherRiskByDate={weatherRiskByDate}
          />
        )}
        {viewMode === 'year' && (
          <CalendarYearGrid
            eventDates={yearEventDates}
            onGoToday={goToday}
            onMoveYear={movePeriod}
            onSelectMonth={selectYearMonth}
            todayDateLabel={todayDateLabel}
            transitionDirection={transitionDirection}
            year={visibleMonth.year}
          />
        )}
        {viewMode === 'month' && (
          <CalendarMonthGrid
            eventCountByDate={eventCountByDate}
            eventItemsByDate={eventItemsByDate}
            getEventTone={eventTone}
            monthCells={monthCells}
            monthTitle={monthLabel(visibleMonth.year, visibleMonth.month)}
            onAddForDate={(date) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              openAddForDate(date);
            }}
            onGoToday={goToday}
            onMoveMonth={movePeriod}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
            todayDateLabel={todayDateLabel}
            transitionDirection={transitionDirection}
            dailyWeatherByDate={dailyWeatherByDate}
            rainyEventKeys={rainyEventKeys}
            weatherRiskByDate={weatherRiskByDate}
          />
        )}
        </Animated.View>
      </Reanimated.View>

      {sheet.shouldRender && (
        <CalendarDaySheet
          events={selectedEvents}
          onAddEvent={() => setIsAddMenuOpen(true)}
          isExpanded={sheet.isExpanded}
          onDismiss={() => sheet.setIsOpen(false)}
          // 복사: 같은 내용으로 새 일정 입력을 엽니다. 반복은 빼고, 날짜만 바꿔 저장하면 됩니다.
          onCopyEvent={(event) => draft.openEditorWithValues({ ...event, repeatGroupId: undefined, repeatMode: 'none' })}
          onEditEvent={editEvent}
          onExpandStateChange={sheet.setExpanded}
          onRemoveEvent={removeEvent}
          outfitEnabled={outfitEnabled}
          outfitFallbackLocation={defaultLocation ?? undefined}
          outfitFigure={outfitFigure}
          outfitSensitivity={outfitSensitivity}
          pm10={selectedForecast.pm10}
          riskByEvent={selectedRiskByEvent}
          selectedDate={selectedDate}
          style={sheet.sheetStyle}
          temperature={selectedForecast.temperature}
          todayDateLabel={todayDateLabel}
          weatherRisks={selectedWeatherRisks}
          weatherLabel={selectedForecast.weatherLabel}
        />
      )}

      {/* 일정 추가 버튼은 날짜 시트와 같은 값으로 움직여, 시트가 열리고 커질 때 함께 올라갑니다(닫힘 20 → 열림 시트 높이+16). */}
      {/* +를 누르면 버튼 위로 두 갈래(직접 일정 등록 · AI 일정 등록)가 펼쳐집니다. 바깥을 누르면 접힙니다. */}
      {isAddMenuOpen && (
        <Reanimated.View entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)} style={styles.calendarAddDialBackdrop}>
          <Pressable accessibilityLabel="일정 추가 접기" onPress={() => setIsAddMenuOpen(false)} style={{ flex: 1 }} />
        </Reanimated.View>
      )}
      {isAddMenuOpen && (
        <Reanimated.View pointerEvents="box-none" style={styles.calendarAddDial}>
          {[
            { icon: 'calendar-outline' as const, label: '직접 일정 등록', onPress: () => draft.openEditor(selectedDate), primary: false },
            { icon: 'sparkles' as const, label: 'AI 일정 등록', onPress: () => setIsMemoOpen(true), primary: true },
          ].map((option, index) => (
            <Reanimated.View
              entering={FadeInDown.delay((1 - index) * 40).duration(180).reduceMotion(ReduceMotion.System)}
              exiting={FadeOutDown.duration(120).reduceMotion(ReduceMotion.System)}
              key={option.label}
            >
              <Pressable
                accessibilityLabel={option.label}
                accessibilityRole="button"
                onPress={() => {
                  setIsAddMenuOpen(false);
                  option.onPress();
                }}
                style={({ pressed }) => [
                  styles.calendarAddDialOption,
                  option.primary ? { backgroundColor: accentTone, borderColor: accentTone } : { borderColor: accentTone },
                  { shadowColor: accentTone },
                  pressed && styles.pressedFeedback,
                ]}
              >
                <Ionicons color={option.primary ? '#ffffff' : accentTone} name={option.icon} size={18} />
                <Text style={[styles.calendarAddDialText, { color: option.primary ? '#ffffff' : accentTone }]}>{option.label}</Text>
              </Pressable>
            </Reanimated.View>
          ))}
        </Reanimated.View>
      )}
      <CalendarMemoSheet
        calendarEvents={events}
        isOpen={isMemoOpen}
        onAdd={addMemoEvents}
        onClose={() => setIsMemoOpen(false)}
        onEditEvent={editMemoEvent}
        riskByEvent={memoRiskByEvent}
        todayDateLabel={todayDateLabel}
      />
      {addedNotice && (
        <Reanimated.View
          entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          key={addedNotice.key}
          style={styles.calendarUndoToast}
        >
          <Text style={styles.calendarUndoText}>{`${addedNotice.ids.length}개 추가했어요`}</Text>
          <Pressable
            accessibilityLabel="방금 추가한 일정 되돌리기"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              addedNotice.ids.forEach(onRemoveEvent);
              setAddedNotice(null);
            }}
          >
            <Text style={styles.calendarUndoAction}>되돌리기</Text>
          </Pressable>
        </Reanimated.View>
      )}
      {removedNotice && !addedNotice && (
        <Reanimated.View
          entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          key={removedNotice.key}
          style={styles.calendarUndoToast}
        >
          <Text numberOfLines={1} style={[styles.calendarUndoText, { flexShrink: 1 }]}>
            {removedNotice.events.length > 1 ? `일정 ${removedNotice.events.length}개를 지웠어요` : `'${removedNotice.events[0]?.title ?? ''}' 지웠어요`}
          </Text>
          <Pressable
            accessibilityLabel="지운 일정 되돌리기"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              if (onAddEvents) onAddEvents(removedNotice.events);
              else removedNotice.events.forEach(onAddEvent);
              setRemovedNotice(null);
            }}
          >
            <Text style={styles.calendarUndoAction}>되돌리기</Text>
          </Pressable>
        </Reanimated.View>
      )}

      <CalendarEventEditor
        activityInput={draft.activityInput}
        endDate={draft.endDate}
        endTime={draft.endTime}
        isRepeatLocked={draft.isRepeatLocked}
        isOpen={draft.isEditorOpen}
        location={draft.location}
        mapPickerUrl={mapPickerUrl}
        memo={draft.memo}
        onChangeActivityInput={draft.setActivityInput}
        onChangeEndDate={draft.setEndDate}
        onChangeEndTime={draft.setEndTime}
        onChangeLocation={draft.setLocation}
        onChangeMemo={draft.setMemo}
        onChangeNotificationHoursBefore={draft.setNotificationHoursBefore}
        onChangeSelectedLocation={draft.setSelectedLocation}
        onChangeRepeatEndDate={draft.setRepeatEndDate}
        onChangeRepeatMode={draft.setRepeatMode}
        onChangeRepeatWeekdays={draft.setRepeatWeekdays}
        onChangeStartDate={draft.setStartDate}
        onChangeStartTime={draft.setStartTime}
        onChangeTitle={draft.setTitle}
        onClose={closeEditor}
        onSave={saveEvent}
        recentLocations={recentLocations}
        repeatEndDate={draft.repeatEndDate}
        repeatMode={draft.repeatMode}
        repeatWeekdays={draft.repeatWeekdays}
        notificationHoursBefore={draft.notificationHoursBefore}
        startDate={draft.startDate}
        startTime={draft.startTime}
        title={draft.title}
      />
    </View>
  );
}
