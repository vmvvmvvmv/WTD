// 설정 탭의 푸시 알림 옵션.
export type NotificationSettings = {
  enabled: boolean;
  calendarReminders: boolean;
  weatherMorningAlerts: boolean;
  // 오늘 미세먼지가 나쁨 이상으로 바뀌면 서버가 하루 한 번 푸시
  dustSpikeAlerts: boolean;
  // TODO: 즐겨찾기 지역까지 알림에 넣는 기능. 필요 없으면 지울 후보.
  includeFavorites: boolean;
};
