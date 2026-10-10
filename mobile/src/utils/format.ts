// API가 문자열·숫자·'-'로 섞어 보내는 값을 숫자로(없으면 undefined).
export function toNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === '' || value === '-') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// 지도 마커·정보창에서 빈 측정값은 '?'로 보여줍니다.
export function formatMapValue(value?: string | number | null, fallback = '?') {
  if (value === null || value === undefined || value === '' || value === '-') return fallback;
  return String(value);
}
