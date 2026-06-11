export type AirGrade = '좋음' | '보통' | '나쁨' | '매우 나쁨';

export function getPm10Grade(value?: number | null): AirGrade | '정보 없음' {
  if (value == null) return '정보 없음';
  if (value <= 30) return '좋음';
  if (value <= 80) return '보통';
  if (value <= 150) return '나쁨';
  return '매우 나쁨';
}

export function getPm25Grade(value?: number | null): AirGrade | '정보 없음' {
  if (value == null) return '정보 없음';
  if (value <= 15) return '좋음';
  if (value <= 35) return '보통';
  if (value <= 75) return '나쁨';
  return '매우 나쁨';
}

export function formatBacktestMae(mae?: number) {
  if (typeof mae !== 'number') {
    return '최근 검증 평균 오차 정보가 아직 없습니다.';
  }

  return `최근 검증 평균 오차는 약 ${mae.toFixed(1)} µg/m³입니다.`;
}
