import { useState } from 'react';

import type { CalendarEvent } from '../../types/calendar';
import type { CalendarActivityInput } from './editor/ActivityTypeSelector';
import type { CalendarRepeatMode } from './calendarRepeat';
import { buildRepeatedEvents, nextDefaultRepeatEndDate } from './calendarRepeat';
import {
  addMinutesWithinDay,
  formatDate,
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

function nextWholeHourDateTime(selectedDate: string) {
  const now = new Date();
  const todayDate = formatDate(now.getFullYear(), now.getMonth(), now.getDate());
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
  const [startTime, setStartTime] = useState(() => nextWholeHourDateTime(initialDate).time);
  const [endTime, setEndTime] = useState(() => addMinutesWithinDay(initialDate, nextWholeHourDateTime(initialDate).time, DEFAULT_DURATION_MINUTES).time);
  const [location, setLocation] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<CalendarLocationCandidate | null>(null);
  const [memo, setMemo] = useState('');
  const [activityInput, setActivityInput] = useState<CalendarActivityInput>('outdoor');
  const [sensitive, setSensitive] = useState(false);
  const [repeatMode, setRepeatMode] = useState<CalendarRepeatMode>('none');
  const [repeatEndDate, setRepeatEndDate] = useState(nextDefaultRepeatEndDate(initialDate));
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>(defaultRepeatWeekdays(initialDate));
  const [notificationHoursBefore, setNotificationHoursBefore] = useState<number | null>(DEFAULT_NOTIFICATION_HOURS_BEFORE);

  const openEditor = (date: string) => {
    const defaultStart = nextWholeHourDateTime(date);
    const defaultEnd = addMinutesWithinDay(defaultStart.date, defaultStart.time, DEFAULT_DURATION_MINUTES);
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
    setActivityInput('outdoor');
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
    const eventEndTime = normalizeTime(event.endTime ?? addMinutesWithinDay(eventDate, eventTime, DEFAULT_DURATION_MINUTES).time);
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
    // '이동'은 선택지에서 뺐으므로 예전 이동 일정은 편집할 때 실외로 보여 줍니다(저장해야 바뀜).
    setActivityInput(event.activityType === 'transit' ? 'outdoor' : event.activityType);
    setSensitive(event.sensitive);
    // 반복 일정은 지금 규칙을 보여 주기만 하고(바꾸지 않음), 한 번짜리 일정은 여기서 반복을 새로 걸 수 있습니다.
    const isSeries = !!event.repeatGroupId && !!event.repeatMode && event.repeatMode !== 'none';
    setRepeatMode(isSeries ? (event.repeatMode as CalendarRepeatMode) : 'none');
    setRepeatEndDate(isSeries && event.repeatEndDate ? event.repeatEndDate : nextDefaultRepeatEndDate(eventDate));
    setRepeatWeekdays(isSeries && event.repeatWeekdays?.length ? event.repeatWeekdays : defaultRepeatWeekdays(eventDate));
    setNotificationHoursBefore(typeof event.notificationHoursBefore === 'number' ? event.notificationHoursBefore : null);
    setIsEditorOpen(true);
  };

  // 메모로 추가 미리보기의 일정을 고칠 때: 값만 채우고 저장하면 새 일정으로 추가됩니다.
  const openEditorWithValues = (event: CalendarEvent) => {
    openEditorForEvent(event);
    setEditingEventId(null);
    setEditingRepeatMeta(null);
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
    const activityType = activityInput;
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
      else if (!baseEvent.repeatGroupId && repeatMode !== 'none') {
        // 한 번짜리 일정에 반복을 걸면: 이 일정은 첫 회차가 되고 나머지 회차를 새로 만듭니다.
        const [first, ...rest] = buildRepeatedEvents(baseEvent, { endDate: repeatEndDate, mode: repeatMode, weekdays: repeatWeekdays });
        onUpdateEvent?.({ ...first, id: editingEventId });
        if (rest.length && onAddEvents) onAddEvents(rest);
        else rest.forEach(onAddEvent);
      } else onUpdateEvent?.(baseEvent);
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
    openEditorWithValues,
    // 반복 일정을 고칠 때는 반복 규칙을 잠급니다(보기만).
    isRepeatLocked: !!editingEventId && !!editingRepeatMeta?.repeatGroupId,
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
    // 반복 방식을 바꾸면 그 방식의 기본 종료일로 맞춘다(매년 30년, 매월 120개월).
    setRepeatMode: (mode: CalendarRepeatMode) => {
      setRepeatMode(mode);
      setRepeatEndDate(nextDefaultRepeatEndDate(startDate, mode));
    },
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
