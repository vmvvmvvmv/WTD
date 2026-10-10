// 백엔드 과거 데이터 API가 받는 YYYYMMDD 형식.
export function toCompactDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

// 화면 표시·오늘 비교에 쓰는 YYYY-MM-DD 형식.
export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 날짜에 며칠을 더하거나 뺀 새 Date.
export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}
