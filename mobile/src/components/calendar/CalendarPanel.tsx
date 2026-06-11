import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, useWindowDimensions, View } from 'react-native';

import { styles } from '../../styles/appStyles';
import type { CalendarEvent, HourlyDustItem, PredictionResponse, WeatherHourlyItem, WeatherMidTermItem, WeatherState } from '../../types/dust';
import { CalendarDaySheet } from './CalendarDaySheet';
import { CalendarEventEditor } from './CalendarEventEditor';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { buildCalendarRiskByEvent, buildSelectedCalendarForecast, type CalendarLocationForecast } from './calendarForecast';
import { buildCalendarEventCounts, buildCalendarEventLanes } from './calendarLayout';
import type { CalendarLocationCandidate } from './calendarLocation';
import {
  buildMonthCells,
  eventTone,
  isDateInEventRange,
  monthLabel,
  parseDateParts,
} from './calendarUtils';
import { topWeatherRiskForDate, weatherRiskIndicators, type CalendarWeatherRiskIndicator } from './calendarWeatherRisk';
import { useCalendarEventDraft } from './useCalendarEventDraft';

const DAY_SHEET_HEIGHT = 300;

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
  onUpdateEvent,
  onUpdateEventSeries,
  prediction,
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
  onUpdateEvent?: (event: CalendarEvent) => void;
  onUpdateEventSeries?: (event: CalendarEvent) => void;
  prediction?: PredictionResponse | null;
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
  const monthCells = useMemo(() => buildMonthCells(visibleMonth.year, visibleMonth.month), [visibleMonth.month, visibleMonth.year]);
  const eventCountByDate = useMemo(() => buildCalendarEventCounts(monthCells, sortedEvents), [monthCells, sortedEvents]);
  const eventItemsByDate = useMemo(() => buildCalendarEventLanes(monthCells, sortedEvents), [monthCells, sortedEvents]);

  // Calendar forecasts are merged once here so the grid, bottom sheet, and risk labels use the same data source order.
  const forecastContext = useMemo(() => ({
    currentPm10,
    dustItems: hourlyItems,
    eventLocationForecasts,
    prediction,
    todayDateLabel,
    weather,
    weatherHourlyItems,
    weatherMidTermItems,
  }), [currentPm10, eventLocationForecasts, hourlyItems, prediction, todayDateLabel, weather, weatherHourlyItems, weatherMidTermItems]);
  const selectedForecast = useMemo(
    () => buildSelectedCalendarForecast(selectedDate, forecastContext),
    [forecastContext, selectedDate],
  );
  const selectedRiskByEvent = useMemo(
    () => buildCalendarRiskByEvent(selectedEvents, forecastContext),
    [forecastContext, selectedEvents],
  );
  const monthRiskByEvent = useMemo(
    () => buildCalendarRiskByEvent(sortedEvents, forecastContext),
    [forecastContext, sortedEvents],
  );
  const weatherRiskByDate = useMemo(() => {
    const next: Record<string, CalendarWeatherRiskIndicator> = {};
    monthCells.forEach((cell) => {
      if (!cell) return;
      const risk = topWeatherRiskForDate(cell.date, sortedEvents, monthRiskByEvent);
      if (risk) next[cell.date] = risk;
    });
    return next;
  }, [monthCells, monthRiskByEvent, sortedEvents]);
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
  const targetDaySheetHeight = isDaySheetExpanded ? expandedSheetHeight : compactSheetHeight;
  const animatedDaySheetHeight = sheetSizeProgress.interpolate({ inputRange: [0, 1], outputRange: [compactSheetHeight, expandedSheetHeight] });
  const calendarBottom = Animated.multiply(sheetProgress, animatedDaySheetHeight);
  const sheetTranslateY = Animated.multiply(Animated.subtract(1, sheetProgress), animatedDaySheetHeight);

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonth.year, visibleMonth.month + offset, 1);
    setMonthTransitionDirection(offset >= 0 ? 1 : -1);
    setVisibleMonth({ month: next.getMonth(), year: next.getFullYear() });
    setIsDaySheetOpen(false);
    setIsDaySheetExpanded(false);
    sheetSizeProgress.setValue(0);
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
        <CalendarMonthGrid
          accentBorderTone={accentBorderTone}
          accentSoftTone={accentSoftTone}
          accentTone={accentTone}
          eventCountByDate={eventCountByDate}
          eventItemsByDate={eventItemsByDate}
          getEventTone={eventTone}
          monthCells={monthCells}
          monthTitle={monthLabel(visibleMonth.year, visibleMonth.month)}
          onMoveMonth={moveMonth}
          onSelectDate={selectDate}
          selectedDate={selectedDate}
          todayDateLabel={todayDateLabel}
          transitionDirection={monthTransitionDirection}
          weatherRiskByDate={weatherRiskByDate}
        />
      </Animated.View>

      {shouldRenderDaySheet && (
        <CalendarDaySheet
          accentTone={accentTone}
          events={selectedEvents}
          isExpanded={isDaySheetExpanded}
          onDismiss={() => setIsDaySheetOpen(false)}
          onEditEvent={editEvent}
          onExpandStateChange={setDaySheetExpanded}
          onRemoveEvent={onRemoveEvent}
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

      <Pressable
        accessibilityLabel="일정 추가"
        onPress={() => draft.openEditor(selectedDate)}
        style={({ pressed }) => [
          styles.calendarFloatingAddButton,
          { backgroundColor: accentTone, bottom: isDaySheetOpen ? targetDaySheetHeight + 16 : 20, shadowColor: accentTone },
          pressed && styles.pressedFeedback,
        ]}
      >
        <Ionicons color="#ffffff" name="add" size={30} />
      </Pressable>

      <CalendarEventEditor
        accentSoftTone={accentSoftTone}
        accentTone={accentTone}
        activityInput={draft.activityInput}
        endDate={draft.endDate}
        endTime={draft.endTime}
        isEditing={!!draft.editingEventId}
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
        onChangeSensitive={draft.setSensitive}
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
        sensitive={draft.sensitive}
        startDate={draft.startDate}
        startTime={draft.startTime}
        title={draft.title}
      />
    </View>
  );
}
