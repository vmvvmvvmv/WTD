// 일정 하나. 반복 일정은 회차마다 따로 저장되고 repeatGroupId로 묶입니다.
export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  time: string;
  endTime?: string;
  activityType: 'outdoor' | 'indoor' | 'transit';
  sensitive: boolean;
  location?: string;
  locationAddress?: string;
  locationCity?: string;
  locationLat?: number;
  locationLng?: number;
  locationRegion?: string;
  locationSource?: 'naver_map' | 'station' | 'manual' | string;
  memo?: string;
  notificationHoursBefore?: number | null;
  repeatEndDate?: string;
  repeatGroupId?: string;
  repeatMode?: 'yearly' | 'monthly' | 'weekly' | 'daily' | string;
  repeatWeekdays?: number[];
};
