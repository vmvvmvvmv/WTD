// 두 좌표 사이 거리(km).
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 위도·경도가 뒤바뀐 경우를 바로잡고, 범위를 벗어난 좌표는 버립니다.
export function normalizeLatLng(latValue?: number | null, lngValue?: number | null) {
  if (typeof latValue !== 'number' || typeof lngValue !== 'number') return null;
  if (!Number.isFinite(latValue) || !Number.isFinite(lngValue)) return null;

  let lat = latValue;
  let lng = lngValue;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    lat = lngValue;
    lng = latValue;
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
