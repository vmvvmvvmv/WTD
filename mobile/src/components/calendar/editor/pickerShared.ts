import { LayoutAnimation } from 'react-native';

import { parseDateParts } from '../calendarUtils';

// 날짜·시간·반복 선택기가 같이 쓰는 것들.
export const pickerUnits = [
  { key: 'year', label: '년' },
  { key: 'month', label: '월' },
  { key: 'day', label: '일' },
  { key: 'hour', label: '시' },
  { key: 'minute', label: '분' },
] as const;

export type DateTimeUnit = typeof pickerUnits[number]['key'];

export function animatePickerLayout() {
  LayoutAnimation.configureNext({
    create: { duration: 180, property: LayoutAnimation.Properties.opacity, type: LayoutAnimation.Types.easeInEaseOut },
    delete: { duration: 130, property: LayoutAnimation.Properties.opacity, type: LayoutAnimation.Types.easeInEaseOut },
    duration: 180,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
  });
}

export function formatMonthDay(date: string) {
  const parts = parseDateParts(date);
  return `${parts.month + 1}월 ${parts.day}일`;
}
