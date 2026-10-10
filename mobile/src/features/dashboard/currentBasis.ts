import type { CurrentDustItem } from '../../types/dust';

// '2026-10-08 13:00', '20261008 1300' 같은 측정 시각 문자열을 Date로.
function parseMeasurementTime(value: string) {
  const compact = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?/);
  const separated = value.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  const match = separated ?? compact;
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0'] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

function measurementAgeLabel(measuredAt: Date, now: Date) {
  const elapsedMinutes = Math.floor((now.getTime() - measuredAt.getTime()) / 60000);
  if (elapsedMinutes < 0) return '';
  if (elapsedMinutes < 1) return '방금 전';
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  if (elapsedMinutes < 48 * 60) return `${Math.floor(elapsedMinutes / 60)}시간 전`;
  return `${Math.floor(elapsedMinutes / (24 * 60))}일 전`;
}

// 측정 시각과 경과 시간을 함께 보여줘, 오래된 대체 데이터를 지금 값으로 오해하지 않게 합니다.
export function formatCurrentBasis(item?: CurrentDustItem | null, now = new Date()) {
  if (!item?.dataTime) return '현재 데이터를 불러오는 중';
  const measuredAt = parseMeasurementTime(item.dataTime);
  if (!measuredAt) return `${item.dataTime} 기준`;
  // 실시간 값이 없어 서버가 저장된 하루 평균으로 대신 보낸 경우, 지금 값으로 오해하지 않게 날짜만 밝힙니다.
  if (item.source === 'stored_daily_latest') {
    return `${measuredAt.getMonth() + 1}월 ${measuredAt.getDate()}일 하루 평균 · 실시간 측정값 없음`;
  }
  const timestamp = [
    measuredAt.getFullYear(),
    String(measuredAt.getMonth() + 1).padStart(2, '0'),
    String(measuredAt.getDate()).padStart(2, '0'),
  ].join('-') + ` ${String(measuredAt.getHours()).padStart(2, '0')}:${String(measuredAt.getMinutes()).padStart(2, '0')}`;
  const age = measurementAgeLabel(measuredAt, now);
  return age ? `${timestamp} 기준 · ${age}` : `${timestamp} 기준`;
}
