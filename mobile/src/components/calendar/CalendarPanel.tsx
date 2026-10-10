import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, InteractionManager, Pressable, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { styles } from '../../styles/appStyles';
import { AppActionIcon } from '../shared/AppActionIcon';
import type { CalendarEvent, HourlyDustItem, OutfitFigure, OutfitSensitivity, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { CalendarDaySheet } from './CalendarDaySheet';
import { CalendarEventEditor } from './CalendarEventEditor';
import { confirmCalendarEventRemoval } from './confirmCalendarEventRemoval';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { buildCalendarRiskByEvent, buildSelectedCalendarForecast, type CalendarLocationForecast } from './calendarForecast';
import { buildCalendarEventCounts, buildCalendarEventLanes } from './calendarLayout';
import type { CalendarLocationCandidate } from './calendarLocation';
import {
  addDays,
  buildMonthCells,
  buildWeekCells,
  eventTone,
  formatDate,
  isDateInEventRange,
  dayLabel,
  monthLabel,
  parseDateParts,
  startOfWeek,
  weekLabel,
} from './calendarUtils';
import { CalendarAgendaList } from './CalendarAgendaList';
import { CalendarTimeline } from './CalendarTimeline';
import { CalendarViewTabs } from './CalendarViewTabs';
import { CalendarYearGrid } from './CalendarYearGrid';
import { topWeatherRiskForDate, weatherRiskIndicators, type CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { useCalendarEventDraft } from './useCalendarEventDraft';

const DAY_SHEET_HEIGHT = 300;

type CalendarViewMode = 'list' | 'day' | 'week' | 'month' | 'year';
const VIEW_MODES: Array<{ key: CalendarViewMode; label: string }> = [
  { key: 'list', label: '목록' },
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
];

export function CalendarPanel({
  accentBorderTone,
  accentSoftTone,
  accentTone,
  currentPm10,
  defaultLocation,
  events,
  eventLocationForecasts,
  hourlyItems,
  mapPickerUrl,
  onAddEvent,
  onAddEvents,
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
  accentBorderTone: string;
  accentSoftTone: string;
  accentTone: string;
  currentPm10?: number;
  defaultLocation?: CalendarLocationCandidate | null;
  events: CalendarEvent[];
  eventLocationForecasts?: Record<string, CalendarLocationForecast>;
  hourlyItems?: HourlyDustItem[];
  mapPickerUrl?: string;
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
  const [selectedDate, setSelectedDate] = useState(todayDateLabel);
  const [monthTransitionDirection, setMonthTransitionDirection] = useState(1);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const parts = parseDateParts(todayDateLabel);
    return { month: parts.month, year: parts.year };
  });
  // 켜 둔 채 날짜가 바뀌면, 어제(=예전 오늘)를 보고 있던 경우에만 새 오늘로 옮깁니다.
  const previousTodayRef = useRef(todayDateLabel);
  useEffect(() => {
    const previousToday = previousTodayRef.current;
    previousTodayRef.current = todayDateLabel;
    if (previousToday === todayDateLabel) return;
    const next = parseDateParts(todayDateLabel);
    const previous = parseDateParts(previousToday);
    setSelectedDate((current) => (current === previousToday ? todayDateLabel : current));
    setVisibleMonth((current) => (current.year === previous.year && current.month === previous.month ? { month: next.month, year: next.year } : current));
  }, [todayDateLabel]);
  const [isDaySheetOpen, setIsDaySheetOpen] = useState(false);
  const [isDaySheetExpanded, setIsDaySheetExpanded] = useState(false);
  const [shouldRenderDaySheet, setShouldRenderDaySheet] = useState(false);
  const draft = useCalendarEventDraft(todayDateLabel, defaultLocation);
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const sheetSizeProgress = useRef(new Animated.Value(0)).current;

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [events],
  );
  const selectedEvents = useMemo(
    () => sortedEvents.filter((event) => isDateInEventRange(selectedDate, event)),
    [selectedDate, sortedEvents],
  );
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  // 일·주 보기는 고른 날짜(가 들어 있는 주)를 보여줍니다.
  const weekStart = startOfWeek(selectedDate);
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
  const weatherRiskByDate = useMemo(() => {
    const next: Record<string, CalendarWeatherRiskIndicator> = {};
    if (!isTransitionDone) return next;
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
    });
    return next;
  }, [forecastContext, isTransitionDone, monthCells, sortedEvents]);
  const selectedWeatherRisks = useMemo(
    () => selectedEvents
      .flatMap((event) => weatherRiskIndicators(selectedRiskByEvent[event.id]))
      .filter((indicator, index, items) => items.findIndex((item) => item.key === indicator.key) === index)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3),
    [selectedEvents, selectedRiskByEvent],
  );

  // The day sheet has two independent animations:
  // - sheetProgress slides the sheet in/out after a date is selected.
  // - sheetSizeProgress expands/collapses the already-open sheet.
  const compactSheetHeight = Math.min(380, Math.max(DAY_SHEET_HEIGHT, Math.round(windowSize.height * 0.42)));
  const expandedSheetHeight = Math.max(compactSheetHeight, windowSize.height - 120);
  const animatedDaySheetHeight = sheetSizeProgress.interpolate({ inputRange: [0, 1], outputRange: [compactSheetHeight, expandedSheetHeight] });
  const calendarBottom = Animated.multiply(sheetProgress, animatedDaySheetHeight);
  const sheetTranslateY = Animated.multiply(Animated.subtract(1, sheetProgress), animatedDaySheetHeight);

  const closeDaySheet = () => {
    setIsDaySheetOpen(false);
    setIsDaySheetExpanded(false);
    sheetSizeProgress.setValue(0);
  };

  // 화살표·스와이프 한 칸: 일 보기는 하루, 주 보기는 7일, 월 보기는 한 달, 년 보기는 1년.
  const moveMonth = (offset: number) => {
    setMonthTransitionDirection(offset >= 0 ? 1 : -1);
    if (viewMode === 'week' || viewMode === 'day') {
      const nextDate = addDays(selectedDate, offset * (viewMode === 'week' ? 7 : 1));
      const parts = parseDateParts(nextDate);
      setSelectedDate(nextDate);
      setVisibleMonth({ month: parts.month, year: parts.year });
    } else {
      const next = new Date(visibleMonth.year, visibleMonth.month + offset * (viewMode === 'year' ? 12 : 1), 1);
      setVisibleMonth({ month: next.getMonth(), year: next.getFullYear() });
    }
    closeDaySheet();
  };

  // 다른 기간을 보다가 "오늘"을 누르면 오늘이 있는 기간으로 (방향에 맞게) 넘어가고 오늘을 고릅니다.
  const [todayYear, todayMonth] = todayDateLabel.split('-').map(Number);
  const isViewingTodayMonth = visibleMonth.year === todayYear && visibleMonth.month === todayMonth - 1;
  const isViewingToday = viewMode === 'day' ? selectedDate === todayDateLabel
    : viewMode === 'week' ? weekStart === startOfWeek(todayDateLabel)
      : viewMode === 'year' ? visibleMonth.year === todayYear : isViewingTodayMonth;
  const goToday = () => {
    const isForward = viewMode === 'week' || viewMode === 'day'
      ? todayDateLabel >= selectedDate
      : todayYear * 12 + todayMonth - 1 >= visibleMonth.year * 12 + visibleMonth.month;
    setMonthTransitionDirection(isForward ? 1 : -1);
    setVisibleMonth({ month: todayMonth - 1, year: todayYear });
    setSelectedDate(todayDateLabel);
    closeDaySheet();
  };

  const changeViewMode = (mode: CalendarViewMode) => {
    if (mode === viewMode) return;
    if ((mode === 'week' || mode === 'day') && viewMode !== 'week' && viewMode !== 'day' && !selectedDate.startsWith(formatDate(visibleMonth.year, visibleMonth.month, 1).slice(0, 8))) {
      // 보던 달 밖의 날짜가 골라져 있으면, 보던 달(이번 달이면 오늘)의 주로 엽니다.
      setSelectedDate(isViewingTodayMonth ? todayDateLabel : formatDate(visibleMonth.year, visibleMonth.month, 1));
    }
    if (mode === 'month' && (viewMode === 'week' || viewMode === 'day')) {
      const parts = parseDateParts(selectedDate);
      setVisibleMonth({ month: parts.month, year: parts.year });
    }
    closeDaySheet();
    setViewMode(mode);
  };

  // 보기를 바꿀 때: 더 큰 단위(일→주→월→년)로 가면 살짝 줄어들며, 작은 단위로 가면 살짝 커지며 나타납니다(줌 느낌).
  const reduceMotion = useReducedMotion();
  const viewProgress = useRef(new Animated.Value(1)).current;
  const previousViewModeRef = useRef(viewMode);
  const [viewZoomFrom, setViewZoomFrom] = useState(1);
  useLayoutEffect(() => {
    const order = VIEW_MODES.map((mode) => mode.key);
    const previous = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;
    if (previous === viewMode || reduceMotion) return;
    setViewZoomFrom(order.indexOf(viewMode) > order.indexOf(previous) ? 1.05 : 0.95);
    viewProgress.setValue(0);
    Animated.timing(viewProgress, { duration: 240, toValue: 1, useNativeDriver: true }).start();
  }, [reduceMotion, viewMode, viewProgress]);
  const viewAnimatedStyle = {
    opacity: viewProgress,
    transform: [{ scale: viewProgress.interpolate({ inputRange: [0, 1], outputRange: [viewZoomFrom, 1] }) }],
  };

  const selectYearMonth = (month: number) => {
    setVisibleMonth({ month, year: visibleMonth.year });
    setViewMode('month');
  };

  const selectDate = (nextDate: string, options?: { openSheet?: boolean }) => {
    setSelectedDate(nextDate);
    setIsDaySheetOpen(options?.openSheet !== false);
  };

  const setDaySheetExpanded = (expanded: boolean) => {
    setIsDaySheetExpanded(expanded);
    Animated.timing(sheetSizeProgress, {
      duration: 220,
      toValue: expanded ? 1 : 0,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    if (isDaySheetOpen) {
      setShouldRenderDaySheet(true);
      Animated.timing(sheetProgress, {
        duration: 220,
        toValue: 1,
        useNativeDriver: false,
      }).start();
      return;
    }

    Animated.timing(sheetProgress, {
      duration: 180,
      toValue: 0,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setShouldRenderDaySheet(false);
      if (finished) {
        setIsDaySheetExpanded(false);
        sheetSizeProgress.setValue(0);
      }
    });
  }, [isDaySheetOpen, sheetProgress, sheetSizeProgress]);

  const saveEvent = () => {
    draft.saveEvent({
      onAddEvent,
      onAddEvents,
      onSaved: (date) => {
        setSelectedDate(date);
        setIsDaySheetOpen(true);
      },
      onUpdateEvent,
      onUpdateEventSeries,
      selectedDate,
    });
  };

  const removeEvent = (event: CalendarEvent) => {
    confirmCalendarEventRemoval(event, {
      removeFollowing: () => onRemoveFollowingEvents(event),
      removeOne: () => onRemoveEvent(event.id),
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
    <View style={styles.calendarPanel}>
      <Animated.View style={[styles.calendarFullStage, { bottom: calendarBottom }]}>
        <CalendarViewTabs accentTone={accentTone} onChange={changeViewMode} tabs={VIEW_MODES} value={viewMode} />
        <Animated.View style={[styles.calendarViewStage, viewAnimatedStyle]}>
        {viewMode === 'list' && (
          <CalendarAgendaList events={sortedEvents} getEventTone={eventTone} onSelectDate={selectDate} todayDateLabel={todayDateLabel} />
        )}
        {(viewMode === 'day' || viewMode === 'week') && (
          <CalendarTimeline
            accentSoftTone={accentSoftTone}
            accentTone={accentTone}
            dates={timelineDates}
            events={sortedEvents}
            getEventTone={eventTone}
            onGoToday={isViewingToday ? undefined : goToday}
            onMove={moveMonth}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
            title={viewMode === 'week' ? weekLabel(weekStart) : dayLabel(selectedDate)}
            todayDateLabel={todayDateLabel}
            transitionDirection={monthTransitionDirection}
            weatherRiskByDate={weatherRiskByDate}
          />
        )}
        {viewMode === 'year' && (
          <CalendarYearGrid
            accentSoftTone={accentSoftTone}
            accentTone={accentTone}
            eventDates={yearEventDates}
            onGoToday={isViewingToday ? undefined : goToday}
            onMoveYear={moveMonth}
            onSelectMonth={selectYearMonth}
            todayDateLabel={todayDateLabel}
            transitionDirection={monthTransitionDirection}
            year={visibleMonth.year}
          />
        )}
        {viewMode === 'month' && (
          <CalendarMonthGrid
            accentBorderTone={accentBorderTone}
            accentSoftTone={accentSoftTone}
            accentTone={accentTone}
            eventCountByDate={eventCountByDate}
            eventItemsByDate={eventItemsByDate}
            getEventTone={eventTone}
            monthCells={monthCells}
            monthTitle={monthLabel(visibleMonth.year, visibleMonth.month)}
            onGoToday={isViewingToday ? undefined : goToday}
            onMoveMonth={moveMonth}
            onSelectDate={selectDate}
            selectedDate={selectedDate}
            todayDateLabel={todayDateLabel}
            transitionDirection={monthTransitionDirection}
            weatherRiskByDate={weatherRiskByDate}
          />
        )}
        </Animated.View>
      </Animated.View>

      {shouldRenderDaySheet && (
        <CalendarDaySheet
          accentTone={accentTone}
          events={selectedEvents}
          onAddEvent={() => draft.openEditor(selectedDate)}
          isExpanded={isDaySheetExpanded}
          onDismiss={() => setIsDaySheetOpen(false)}
          onEditEvent={editEvent}
          onExpandStateChange={setDaySheetExpanded}
          onRemoveEvent={removeEvent}
          outfitEnabled={outfitEnabled}
          outfitFallbackLocation={defaultLocation ?? undefined}
          outfitFigure={outfitFigure}
          outfitSensitivity={outfitSensitivity}
          pm10={selectedForecast.pm10}
          riskByEvent={selectedRiskByEvent}
          selectedDate={selectedDate}
          style={{ height: animatedDaySheetHeight, maxHeight: animatedDaySheetHeight, transform: [{ translateY: sheetTranslateY }] }}
          temperature={selectedForecast.temperature}
          todayDateLabel={todayDateLabel}
          weatherRisks={selectedWeatherRisks}
          weatherLabel={selectedForecast.weatherLabel}
        />
      )}

      {/* 일정 추가 버튼은 날짜 시트와 같은 값으로 움직여, 시트가 열리고 커질 때 함께 올라갑니다(닫힘 20 → 열림 시트 높이+16). */}
      <Animated.View style={[styles.calendarFloatingAddDock, { bottom: Animated.add(calendarBottom, Animated.subtract(20, Animated.multiply(sheetProgress, 4))) }]}>
        <Pressable
          accessibilityLabel="일정 추가"
          onPress={() => draft.openEditor(selectedDate)}
          style={({ pressed }) => [
            styles.calendarFloatingAddButton,
            styles.calendarFloatingAddButtonDocked,
            { backgroundColor: '#ffffff', borderColor: accentTone, shadowColor: accentTone },
            pressed && styles.pressedFeedback,
          ]}
        >
          <AppActionIcon name="schedule" size={38} />
        </Pressable>
      </Animated.View>

      <CalendarEventEditor
        accentSoftTone={accentSoftTone}
        accentTone={accentTone}
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
        onClose={draft.closeEditor}
        onSave={saveEvent}
        repeatEndDate={draft.repeatEndDate}
        repeatMode={draft.repeatMode}
        repeatWeekdays={draft.repeatWeekdays}
        notificationHoursBefore={draft.notificationHoursBefore}
        selectedLocation={draft.selectedLocation}
        startDate={draft.startDate}
        startTime={draft.startTime}
        title={draft.title}
      />
    </View>
  );
}
