// 배너 비·눈 효과의 개수와 기울기. 화면 코드와 떼어 두어 테스트할 수 있게 했다.

const clampOr = (value: number | null | undefined, min: number, max: number, fallback: number) =>
  (typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback);

// 비: 시간당 강수량(mm)에 따라 24~100개. 10mm 이상은 같게 본다. 강수량을 모르면 보통 비(1mm)로 본다.
export function rainDropCount(rainMm?: number | null) {
  return Math.round(24 + clampOr(rainMm, 0, 10, 1) * 7.6);
}

// 눈: 강수량(눈이 녹은 물의 양, mm)은 비보다 작게 나와서 5mm 이상을 최대로 본다. 20~90개.
export function snowFlakeCount(precipitationMm?: number | null) {
  return Math.round(20 + clampOr(precipitationMm, 0, 5, 1) * 14);
}

// 비·눈 공통: 풍속(m/s)에 따라 수직에서 5°~45° 기운다(오른쪽 위→왼쪽 아래). 10m/s 이상은 같게 본다. 풍속을 모르면 약한 바람(2m/s)으로 본다.
export function fallTiltDegrees(windSpeed?: number | null) {
  return 5 + clampOr(windSpeed, 0, 10, 2) * 4;
}
