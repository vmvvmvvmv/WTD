import { useEffect, useState } from 'react';

import { withAddedEvents, withoutFollowingOccurrences } from '../../components/calendar/calendarRepeat';
import { saveCalendarEvents } from '../../storage/appStorage';
import type { CalendarEvent } from '../../types/calendar';
import { refreshWidget } from '../../widget/refreshWidget';

export function useCalendarEvents(hasLoadedStore: boolean) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (hasLoadedStore) void saveCalendarEvents(events).then(refreshWidget);
  }, [events, hasLoadedStore]);

  const addEvent = (event: CalendarEvent) => {
    setEvents((current) => withAddedEvents(current, [event]));
  };
  const addEvents = (newEvents: CalendarEvent[]) => {
    setEvents((current) => withAddedEvents(current, newEvents));
  };
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
