import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHolidayCache, parseHolidayItems, replaceHolidayYear } from './holidayData.ts';

test('공휴일 응답에서 날짜·이름이 맞는 항목만 남긴다', () => {
  assert.deepEqual(parseHolidayItems([
    { date: '2026-10-09', name: '한글날' },
    { date: '20261003', name: '개천절' },
    { date: '2026-10-05', name: ' ' },
    null,
  ]), { '2026-10-09': '한글날' });
  assert.deepEqual(parseHolidayItems({ items: [] }), {});
  assert.deepEqual(parseHolidayCache({ '2026-01-01': '1월1일', bad: 1 }), { '2026-01-01': '1월1일' });
});

test('한 해를 새로 받으면 그해만 바꾸고 다른 해는 둔다', () => {
  const current = { '2026-06-03': '임시공휴일', '2026-10-09': '한글날', '2027-01-01': '1월1일' };
  assert.deepEqual(replaceHolidayYear(current, 2026, { '2026-10-09': '한글날' }), { '2026-10-09': '한글날', '2027-01-01': '1월1일' });
});
