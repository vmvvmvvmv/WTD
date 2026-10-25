import { useEffect, useRef, useState } from 'react';

import { MAX_STORED_EVENTS, withAddedEvents, withoutFollowingOccurrences } from '../../components/calendar/calendarRepeat';
import { saveCalendarEvents } from '../../storage/appStorage';
import type { CalendarEvent } from '../../types/calendar';
import { refreshWidget } from '../../widget/refreshWidget';

export function useCalendarEvents(hasLoadedStore: boolean, notify: (message: string) => void) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // 일정이 상한(1,000개)을 넘어 가장 오래된 일정을 지웠으면, 저장한 뒤 몇 개를 지웠는지 알린다(말없이 지우지 않게).
  const droppedCountRef = useRef(0);
  const addWithLimit = (added: CalendarEvent[]) => {
    setEvents((current) => {
      const next = withAddedEvents(current, added);
      droppedCountRef.current = current.length + added.length - next.length;
      return next;
    });
  };
  useEffect(() => {
    if (droppedCountRef.current <= 0) return;
    notify(`일정이 ${MAX_STORED_EVENTS.toLocaleString()}개를 넘어 가장 오래된 일정 ${droppedCountRef.current}개를 지웠어요.`);
    droppedCountRef.current = 0;
  }, [events, notify]);

  useEffect(() => {
    if (hasLoadedStore) void saveCalendarEvents(events).then(refreshWidget);
  }, [events, hasLoadedStore]);

  const addEvent = (event: CalendarEvent) => addWithLimit([event]);
  const addEvents = (newEvents: CalendarEvent[]) => addWithLimit(newEvents);
  const removeEvent = (eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  };
  const removeFollowingEvents = (target: CalendarEvent) => {
    setEvents((current) => withoutFollowingOccurrences(current, target));
  };
  const updateEvent = (updatedEvent: CalendarEvent) => {
    setEvents((current) => current
      .map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
  };
  const updateEventSeries = (updatedEvent: CalendarEvent) => {
    if (!updatedEvent.repeatGroupId) {
      updateEvent(updatedEvent);
      return;
    }
    setEvents((current) => current
      .map((event) => {
        if (event.repeatGroupId !== updatedEvent.repeatGroupId) return event;
        return {
          ...event,
          activityType: updatedEvent.activityType,
          endTime: updatedEvent.endTime,
          location: updatedEvent.location,
          locationAddress: updatedEvent.locationAddress,
          locationCity: updatedEvent.locationCity,
          locationLat: updatedEvent.locationLat,
          locationLng: updatedEvent.locationLng,
          locationRegion: updatedEvent.locationRegion,
          locationSource: updatedEvent.locationSource,
          memo: updatedEvent.memo,
          notificationHoursBefore: updatedEvent.notificationHoursBefore,
          sensitive: updatedEvent.sensitive,
          time: updatedEvent.time,
          title: updatedEvent.title,
        };
      })
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)));
  };

  return { events, setEvents, addEvent, addEvents, removeEvent, removeFollowingEvents, updateEvent, updateEventSeries };
}
