import { loadCalendarDefaultLeadValue, saveCalendarDefaultLeadValue } from '../../storage/appStorage';

// 새 일정의 알림 기본값(몇 시간 전, null이면 알림 없음). 설정에서 바꾸고, 직접 입력·AI 등록이 새 일정을 만들 때 씁니다.
// 앱이 켜질 때 한 번 불러 메모리에 두고, 바꾸면 바로 반영하고 저장합니다.
let current: number | null = 1;

export const CALENDAR_DEFAULT_LEAD_OPTIONS: { label: string; value: number | null }[] = [
  { label: '없음', value: null },
  { label: '30분 전', value: 0.5 },
  { label: '1시간 전', value: 1 },
  { label: '3시간 전', value: 3 },
];

export async function loadCalendarDefaultLead() {
  const stored = await loadCalendarDefaultLeadValue();
  if (stored !== undefined) current = stored;
  return current;
}

export function calendarDefaultLead() {
  return current;
}

export function setCalendarDefaultLead(value: number | null) {
  current = value;
  void saveCalendarDefaultLeadValue(value);
}
