import { Alert } from 'react-native';

import type { CalendarEvent } from '../../types/calendar';

// 일정 삭제 전 확인. 반복 일정이면 "이 일정만 / 이후 일정 모두"를 고르게 한다(캘린더·홈 공통).
export function confirmCalendarEventRemoval(event: CalendarEvent, actions: { removeFollowing: () => void; removeOne: () => void }) {
  const cancel = { style: 'cancel' as const, text: '취소' };
  if (!event.repeatGroupId) {
    Alert.alert('일정 삭제', `'${event.title}' 일정을 삭제할까요?`, [
      cancel,
      { onPress: actions.removeOne, style: 'destructive', text: '삭제' },
    ]);
    return;
  }
  Alert.alert('반복 일정 삭제', `'${event.title}' 반복 일정을 어떻게 삭제할까요?`, [
    cancel,
    { onPress: actions.removeOne, style: 'destructive', text: '이 일정만' },
    { onPress: actions.removeFollowing, style: 'destructive', text: '이후 일정 모두' },
  ]);
}
