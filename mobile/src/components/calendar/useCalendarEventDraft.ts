import { useState } from 'react';

import type { CalendarEvent } from '../../types/dust';
import type { CalendarActivityInput } from './CalendarEventEditor';
import type { CalendarRepeatMode } from './calendarRepeat';
import { buildRepeatedEvents, nextDefaultRepeatEndDate } from './calendarRepeat';
import {
  addMinutesToDateTime,
  formatDate,
  inferActivityType,
  makeCalendarId,
  normalizeDate,
  normalizeEndDate,
  normalizeTime,
} from './calendarUtils';
import type { CalendarLocationCandidate } from './calendarLocation';

type SaveParams = {
  onAddEvent: (event: CalendarEvent) => void;
  onAddEvents?: (events: CalendarEvent[]) => void;
  onSaved: (date: string) => void;
  onUpdateEvent?: (event: CalendarEvent) => void;
  onUpdateEventSeries?: (event: CalendarEvent) => void;
  selectedDate: string;
};

const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_NOTIFICATION_HOURS_BEFORE = 1;
type EditScope = 'single' | 'series';

function nextWholeHourDateTime(selectedDate: string, todayDate: string) {
  const now = new Date();
  const start = new Date(now);
  if (now.getMinutes() > 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0) {
    start.setHours(now.getHours() + 1, 0, 0, 0);
  } else {
    start.setMinutes(0, 0, 0);
  }
  return {
    date: selectedDate === todayDate ? formatDate(start.getFullYear(), start.getMonth(), start.getDate()) : selectedDate,
    time: `${String(start.getHours()).padStart(2, '0')}:00`,
  };
}

function defaultRepeatWeekdays(date: string) {
  return [new Date(`${date}T00:00:00`).getDay()];
}

function locationCandidateFromEvent(event: CalendarEvent): CalendarLocationCandidate | null {
  if (typeof event.locationLat !== 'number' || typeof event.locationLng !== 'number') return null;
  return {
    address: event.locationAddress,
    city: event.locationCity,
    label: event.location ?? '지도 선택 위치',
    lat: event.locationLat,
    lng: event.locationLng,
    region: event.locationRegion,
    source: event.locationSource ?? 'naver_map',
  };
}

// Draft state is isolated from CalendarPanel so form fields, repeat rules, and save behavior can evolve independently.
export function useCalendarEventDraft(initialDate: string, defaultLocation?: CalendarLocationCandidate | null) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingScope, setEditingScope] = useState<EditScope>('single');
  const [editingRepeatMeta, setEditingRepeatMeta] = useState<Pick<CalendarEvent, 'repeatEndDate' | 'repeatGroupId' | 'repeatMode' | 'repeatWeekdays'> | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(() => nextWholeHourDateTime(initialDate, initialDate).time);
  const [endTime, setEndTime] = useState(() => addMinutesToDateTime(initialDate, nextWholeHourDateTime(initialDate, initialDate).time, DEFAULT_DURATION_MINUTES).time);
  const [location, setLocation] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<CalendarLocationCandidate | null>(null);
  const [memo, setMemo] = useState('');
  const [activityInput, setActivityInput] = useState<CalendarActivityInput>('auto');
  const [sensitive, setSensitive] = useState(false);
  const [repeatMode, setRepeatMode] = useState<CalendarRepeatMode>('none');
  const [repeatEndDate, setRepeatEndDate] = useState(nextDefaultRepeatEndDate(initialDate));
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(defaultRepeatWeekdays(initialDate));
  const [notificationHoursBefore, setNotificationHoursBefore] = useState<number | null>(DEFAULT_NOTIFICATION_HOURS_BEFORE);

  const openEditor = (date: string) => {
    const defaultStart = nextWholeHourDateTime(date, initialDate);
    const defaultEnd = addMinutesToDateTime(defaultStart.date, defaultStart.time, DEFAULT_DURATION_MINUTES);
    const initialLocation = defaultLocation ?? null;
    setEditingEventId(null);
    setEditingScope('single');
    setEditingRepeatMeta(null);
    setTitle('');
    setStartDate(defaultStart.date);
    setEndDate(defaultEnd.date);
    setStartTime(defaultStart.time);
    setEndTime(defaultEnd.time);
    setLocation(initialLocation?.label ?? '');
    setSelectedLocation(initialLocation);
    setMemo('');
    setActivityInput('auto');
    setSensitive(false);
    setRepeatMode('none');
    setRepeatEndDate(nextDefaultRepeatEndDate(date));
    setRepeatWeekdays(defaultRepeatWeekdays(date));
    setNotificationHoursBefore(DEFAULT_NOTIFICATION_HOURS_BEFORE);
    setIsEditorOpen(true);
  };

  const openEditorForEvent = (event: CalendarEvent, scope: EditScope = 'single') => {
    const eventDate = normalizeDate(event.date, initialDate);
    const eventEndDate = normalizeEndDate(event.endDate ?? event.date, eventDate);
    const eventTime = normalizeTime(event.time);
    const eventEndTime = normalizeTime(event.endTime ?? addMinutesToDateTime(eventDate, eventTime, DEFAULT_DURATION_MINUTES).time);
    setEditingEventId(event.id);
    setEditingScope(scope);
    setEditingRepeatMeta({
      repeatEndDate: event.repeatEndDate,
      repeatGroupId: event.repeatGroupId,
      repeatMode: event.repeatMode,
      repeatWeekdays: event.repeatWeekdays,
    });
    setTitle(event.title);
    setStartDate(eventDate);
    setEndDate(eventEndDate);
    setStartTime(eventTime);
    setEndTime(eventEndTime);
    setLocation(event.location ?? '');
    setSelectedLocation(locationCandidateFromEvent(event));
    setMemo(event.memo ?? '');
    setActivityInput(event.activityType);
    setSensitive(event.sensitive);
    setRepeatMode('none');
    setRepeatEndDate(nextDefaultRepeatEndDate(eventDate));
    setRepeatWeekdays(defaultRepeatWeekdays(eventDate));
    setNotificationHoursBefore(typeof event.notificationHoursBefore === 'number' ? event.notificationHoursBefore : null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => setIsEditorOpen(false);

  const saveEvent = ({ onAddEvent, onAddEvents, onSaved, onUpdateEvent, onUpdateEventSeries, selectedDate }: SaveParams) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    // The visible place name and stored coordinates must stay in sync. If the label was changed manually, drop stale coordinates.
    const normalizedLocation = selectedLocation && selectedLocation.label === location.trim() ? selectedLocation : null;
    const detailMemo = memo.trim();
    const normalizedStartDate = normalizeDate(startDate, selectedDate);
    const normalizedEndDate = normalizeEndDate(endDate, normalizedStartDate);
    const activityType = activityInput === 'auto' ? inferActivityType(nextTitle, detailMemo) : activityInput;
    const baseEvent: CalendarEvent = {
      activityType,
      date: normalizedStartDate,
      endDate: normalizedEndDate,
      endTime: normalizeTime(endTime),
      id: editingEventId ?? makeCalendarId(),
      location: location.trim() || undefined,
      locationAddress: normalizedLocation?.address,
      locationCity: normalizedLocation?.city,
      locationLat: normalizedLocation?.lat,
      locationLng: normalizedLocation?.lng,
      locationRegion: normalizedLocation?.region,
      locationSource: normalizedLocation?.source,
      memo: detailMemo,
      notificationHoursBefore,
      sensitive,
      time: normalizeTime(startTime),
      title: nextTitle,
      ...(editingRepeatMeta ?? {}),
    };
    if (editingEventId) {
      if (editingScope === 'series' && baseEvent.repeatGroupId) onUpdateEventSeries?.(baseEvent);
      else onUpdateEvent?.(baseEvent);
      setEditingEventId(null);
      setEditingScope('single');
      setEditingRepeatMeta(null);
      setIsEditorOpen(false);
      onSaved(normalizedStartDate);
      return;
    }
    const repeatedEvents = buildRepeatedEvents(baseEvent, {
      endDate: repeatEndDate,
      mode: repeatMode,
      weekdays: repeatWeekdays,
    });

    if (repeatedEvents.length > 1 && onAddEvents) onAddEvents(repeatedEvents);
    else repeatedEvents.forEach(onAddEvent);
    setIsEditorOpen(false);
    onSaved(normalizedStartDate);
  };

  return {
    activityInput,
    closeEditor,
    editingEventId,
    endDate,
    endTime,
    isEditorOpen,
    location,
    memo,
    notificationHoursBefore,
    openEditor,
    openEditorForEvent,
    repeatEndDate,
    repeatMode,
    repeatWeekdays,
    saveEvent,
    sensitive,
    setActivityInput,
    setEndDate,
    setEndTime,
    setLocation,
    setMemo,
    setNotificationHoursBefore,
    setRepeatEndDate,
    setRepeatMode,
    setRepeatWeekdays,
    setSensitive,
    setStartDate,
    setStartTime,
    setTitle,
    selectedLocation,
    setSelectedLocation,
    startDate,
    startTime,
    title,
  };
}
