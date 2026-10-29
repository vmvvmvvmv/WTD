// 서버·저장소에서 온 공휴일 값을 {YYYY-MM-DD: 이름}으로 바꿉니다. 모양이 이상한 항목은 건너뜁니다.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseHolidayItems(items: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(items)) return result;
  items.forEach((item) => {
    const { date, name } = (item ?? {}) as { date?: unknown; name?: unknown };
    if (typeof date === 'string' && DATE_PATTERN.test(date) && typeof name === 'string' && name.trim()) result[date] = name.trim();
  });
  return result;
}

export function parseHolidayCache(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return parseHolidayItems(Object.entries(value).map(([date, name]) => ({ date, name })));
}

// 한 해치를 새로 받으면 그해 값만 통째로 바꿉니다(취소된 임시공휴일이 남지 않게). 다른 해는 그대로 둡니다.
export function replaceHolidayYear(current: Record<string, string>, year: number, fresh: Record<string, string>) {
  const prefix = `${year}-`;
  return {
    ...Object.fromEntries(Object.entries(current).filter(([date]) => !date.startsWith(prefix))),
    ...fresh,
  };
}
