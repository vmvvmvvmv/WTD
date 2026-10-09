export const bauhausColors = {
  // One UI-inspired weather palette. Keep the legacy export name to avoid
  // touching every feature component that already imports these shared tokens.
  background: '#F4F8FC',
  foreground: '#17202A',
  red: '#E85C6B',
  redSoft: '#FFF0EE',
  blue: '#3D7FEA',
  blueSoft: '#E8F1FE',
  yellow: '#FFB95C',
  amber: '#C58A19',
  muted: '#E7EFF7',
  border: '#D7E4F2',
  surface: '#F8FAFD',
  white: '#FFFFFF',
} as const;

// 글자색 단계입니다. 비슷한 회색을 여기 다섯 가지로만 씁니다.
// secondary·muted는 흰 배경에서 작은 글자도 읽히도록 명암비 4.5:1 이상으로 맞췄습니다.
export const textColors = {
  heading: '#23324D', // 섹션 제목
  primary: '#17202A', // 항목 이름, 본문
  secondary: '#4F5D70', // 설명, 보조 정보
  muted: '#6B7789', // 기준 시각, 빈 상태 안내, 완료 항목
  disabled: '#B7C0CC', // 비활성 아이콘 (글자에는 쓰지 않음)
} as const;

export const bauhausSmallShadow = {
  shadowColor: bauhausColors.foreground,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const bauhausMediumShadow = {
  shadowColor: bauhausColors.foreground,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation: 4,
} as const;

export const handDrawnCardShape = {
  borderRadius: 24,
} as const;

export const handDrawnControlShape = {
  borderRadius: 14,
} as const;
