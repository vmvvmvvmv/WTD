import { DEFAULT_CITY, DEFAULT_NOTIFICATION_SETTINGS, DEFAULT_REGION } from '../constants/dust';
import { getAirQualityMeta } from '../features/airQuality/airQualityGrade';
import type {
  CurrentDustItem,
  DataMetricKey,
  NotificationSettings,
  PastDustItem,
  PredictionResponse,
  RegionState,
  StationDustItem,
} from '../types/dust';

// API?먯꽌 臾몄옄?? ?レ옄, '-' ?뺥깭濡??욎뿬 ?ㅻ뒗 媛믪쓣 ?덉쟾?섍쾶 ?レ옄濡?諛붽퓠?덈떎.
export function toNumber(value?: string | number | null) {
  if (value === null || value === undefined || value === '' || value === '-') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// 諛깆뿏??怨쇨굅 ?곗씠??API媛 ?붽뎄?섎뒗 YYYYMMDD ?뺤떇?쇰줈 ?좎쭨瑜?諛붽퓠?덈떎.
export function toCompactDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

// ?붾㈃ ?쒖떆? ?ㅻ뒛 ?좎쭨 鍮꾧탳???곕뒗 YYYY-MM-DD ?뺤떇?낅땲??
export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 湲곗? ?좎쭨?먯꽌 ?먰븯???쇱닔留뚰겮 ?뷀븯嫄곕굹 類 Date瑜?留뚮벊?덈떎.
export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

// ?덉륫 API媛 吏곸젒 ?묐떟?섍굅??city/region?쇰줈 以묒꺽 ?묐떟?섎뒗 ???뺥깭瑜??섎굹濡??뺢퇋?뷀빀?덈떎.
export function normalizePredictionResponse(raw: unknown, city = DEFAULT_CITY, region = DEFAULT_REGION): PredictionResponse {
  if (!raw || typeof raw !== 'object') return {};
  const direct = raw as PredictionResponse;
  if (Array.isArray(direct.predictions)) return direct;
  const cityBucket = (raw as Record<string, unknown>)[city];
  if (!cityBucket || typeof cityBucket !== 'object') return {};
  const regionBucket = (cityBucket as Record<string, unknown>)[region];
  if (!regionBucket || typeof regionBucket !== 'object') return {};
  return regionBucket as PredictionResponse;
}

// PM10 ?섏튂瑜??쒓뎅 ?湲곗쭏 ?깃툒 ?띿뒪?몃줈 蹂?섑빀?덈떎.
export function getPm10Label(value?: number) { return getAirQualityMeta('pm10', value).label; }
export function getPm25Label(value?: number) { return getAirQualityMeta('pm25', value).label; }
export function getO3Label(value?: number) { return getAirQualityMeta('o3', value).label; }
export function getNo2Label(value?: number) { return getAirQualityMeta('no2', value).label; }

export function getPm10Tone(value?: number) { return getAirQualityMeta('pm10', value).tone; }
export function getPm10SoftTone(value?: number) { return getAirQualityMeta('pm10', value).soft; }
export function getPm10BorderTone(value?: number) { return getAirQualityMeta('pm10', value).border; }
export function getPm25Tone(value?: number) { return getAirQualityMeta('pm25', value).tone; }
export function getO3Tone(value?: number) { return getAirQualityMeta('o3', value).tone; }
export function getNo2Tone(value?: number) { return getAirQualityMeta('no2', value).tone; }

// 怨쇨굅 ?곗씠??item?먯꽌 ?꾩옱 ?좏깮???ㅼ뿼臾쇱쭏??媛믪쓣 爰쇰깄?덈떎.
export function getMetricValue(item: PastDustItem, metric: DataMetricKey) {
  if (metric === 'pm10') return toNumber(item.pm10Value);
  if (metric === 'pm25') return toNumber(item.pm25Value);
  if (metric === 'o3') return toNumber(item.o3Value);
  return toNumber(item.no2Value);
}

// ?좏깮???ㅼ뿼臾쇱쭏 醫낅쪟??留욌뒗 ?깃툒 ?띿뒪?몃? 諛섑솚?⑸땲??
export function getMetricLabel(metric: DataMetricKey, value?: number) {
  if (metric === 'pm10') return getPm10Label(value);
  if (metric === 'pm25') return getPm25Label(value);
  if (metric === 'o3') return getO3Label(value);
  return getNo2Label(value);
}

// ?좏깮???ㅼ뿼臾쇱쭏 醫낅쪟??留욌뒗 UI 媛뺤“?됱쓣 諛섑솚?⑸땲??
export function getMetricTone(metric: DataMetricKey, value?: number) {
  if (metric === 'pm10') return getPm10Tone(value);
  if (metric === 'pm25') return getPm25Tone(value);
  if (metric === 'o3') return getO3Tone(value);
  return getNo2Tone(value);
}

// 吏???섎떒 ?뺣낫李쎌쓽 PM10 寃뚯씠吏 ?덈퉬瑜?0~100% 踰붿쐞濡?怨꾩궛?⑸땲??
export function getPm10Progress(value?: number) {
  if (typeof value !== 'number') return 0;
  return Math.max(4, Math.min(100, (value / 150) * 100));
}

// 寃??鍮꾧탳瑜??쎄쾶 ?섎젮怨?怨듬갚???쒓굅?섍퀬 ?뚮Ц?먮줈 ?뺢퇋?뷀빀?덈떎.
export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s/g, '');
}

// ?꾩옱 ?곗씠?곌? ?ㅼ떆媛꾩씤吏 怨쇨굅 fallback?몄???留욊쾶 湲곗? ?쒓컖 臾멸뎄瑜?留뚮벊?덈떎.
function parseMeasurementTime(value: string) {
  const compact = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?/);
  const separated = value.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  const match = separated ?? compact;
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0'] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

function measurementAgeLabel(measuredAt: Date, now: Date) {
  const elapsedMinutes = Math.floor((now.getTime() - measuredAt.getTime()) / 60000);
  if (elapsedMinutes < 0) return '';
  if (elapsedMinutes < 1) return '방금 전';
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  if (elapsedMinutes < 48 * 60) return `${Math.floor(elapsedMinutes / 60)}시간 전`;
  return `${Math.floor(elapsedMinutes / (24 * 60))}일 전`;
}

// 측정 시각과 데이터 경과 시간을 함께 보여줘 오래된 fallback 데이터를 최신값으로 오인하지 않게 합니다.
export function formatCurrentBasis(item?: CurrentDustItem | null, now = new Date()) {
  if (!item?.dataTime) return '현재 데이터를 불러오는 중';
  const measuredAt = parseMeasurementTime(item.dataTime);
  if (!measuredAt) return `${item.dataTime} 기준`;
  // 실시간 값이 없어 서버가 저장된 하루 평균으로 대신 보낸 경우, 지금 값으로 오해하지 않게 날짜만 밝힙니다.
  if (item.source === 'stored_daily_latest') {
    return `${measuredAt.getMonth() + 1}월 ${measuredAt.getDate()}일 하루 평균 · 실시간 측정값 없음`;
  }
  const timestamp = [
    measuredAt.getFullYear(),
    String(measuredAt.getMonth() + 1).padStart(2, '0'),
    String(measuredAt.getDate()).padStart(2, '0'),
  ].join('-') + ` ${String(measuredAt.getHours()).padStart(2, '0')}:${String(measuredAt.getMinutes()).padStart(2, '0')}`;
  const age = measurementAgeLabel(measuredAt, now);
  return age ? `${timestamp} 기준 · ${age}` : `${timestamp} 기준`;
}

export function formatValue(value: number | undefined, decimals: number) {
  if (typeof value !== 'number') return '-';
  return value.toFixed(decimals);
}

// 吏??留덉빱/?섎떒 ?뺣낫李쎌뿉??鍮?痢≪젙媛믪? '?'濡?蹂댁뿬以띾땲??
export function formatMapValue(value?: string | number | null, fallback = '?') {
  if (value === null || value === undefined || value === '' || value === '-') return fallback;
  return String(value);
}

// GPS 醫뚰몴? 痢≪젙??醫뚰몴 ?ъ씠??嫄곕━瑜?km ?⑥쐞濡?怨꾩궛?⑸땲??
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

// ?꾨룄/寃쎈룄媛 ?ㅼ쭛? ?ㅼ뼱??寃쎌슦源뚯? 蹂댁젙?섍퀬 ?좏슚?섏? ?딆? 醫뚰몴??踰꾨┰?덈떎.
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

// CSV ?ㅼ슫濡쒕뱶?먯꽌 ?쇳몴? ?곗샂?쒓? 源⑥?吏 ?딄쾶 媛믪쓣 媛먯뙃?덈떎.
export function csvSafe(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

// ??吏??씠 媛숈? ???꾩? 援?援?痢≪젙?뚮? 媛由ы궎?붿? 鍮꾧탳?⑸땲??
export function isSameRegion(a: RegionState, b: RegionState) {
  return a.city === b.city && a.region === b.region;
}

// 痢≪젙??以묐났 ?쒓굅? React key ?앹꽦???꾪븳 怨좎쑀 臾몄옄?댁엯?덈떎.
export function stationIdentity(station: StationDustItem) {
  return [
    station.sido ?? '',
    station.city ?? '',
    station.name ?? '',
    station.addr ?? '',
    station.lat ?? '',
    station.lng ?? '',
  ].join('|');
}

// 媛숈? 痢≪젙?뚭? 寃??寃곌낵???щ윭 踰??⑥? ?딅룄濡?以묐났???쒓굅?⑸땲??
export function uniqueStations(stations: StationDustItem[]) {
  const seen = new Set<string>();
  return stations.filter((station) => {
    const key = stationIdentity(station);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// SecureStore????λ맂 吏??JSON??RegionState濡??덉쟾?섍쾶 蹂듭썝?⑸땲??
export function parseStoredRegion(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RegionState>;
    if (typeof parsed.city === 'string' && typeof parsed.region === 'string' && parsed.city && parsed.region) {
      return { city: parsed.city, region: parsed.region, label: typeof parsed.label === 'string' ? parsed.label : undefined };
    }
  } catch {
    return null;
  }
  return null;
}

// ??λ맂 利먭꺼李얘린 紐⑸줉??蹂듭썝?섍퀬 理쒕? 15媛쒓퉴吏留??좎??⑸땲??
export function parseStoredFavoriteRegions(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Partial<RegionState>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item.city === 'string' && typeof item.region === 'string' && item.city && item.region)
      .map((item) => ({ city: item.city as string, region: item.region as string, label: typeof item.label === 'string' ? item.label : undefined }))
      .slice(0, 15);
  } catch {
    return [];
  }
}

// 吏??理쒓렐 寃??紐⑸줉??蹂듭썝?⑸땲??
export function parseStoredMapRecentSearches(value: string | null): StationDustItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Partial<StationDustItem>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item.sido === 'string' && (typeof item.name === 'string' || typeof item.city === 'string') && typeof item.lat === 'number' && typeof item.lng === 'number')
      .map((item) => ({
        addr: typeof item.addr === 'string' ? item.addr : undefined,
        city: typeof item.city === 'string' ? item.city : undefined,
        lat: item.lat as number,
        lng: item.lng as number,
        name: typeof item.name === 'string' ? item.name : undefined,
        sido: item.sido as string,
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

// ??λ맂 ?뚮┝ ?ㅼ젙??蹂듭썝?섍퀬 ?꾨씫??媛믪? 湲곕낯媛믪쑝濡?梨꾩썎?덈떎.
export function parseStoredNotificationSettings(value: string | null): NotificationSettings {
  if (!value) return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    const isLegacyDisabledDefault = parsed.enabled === false
      && parsed.calendarReminders !== false
      && parsed.weatherMorningAlerts !== true
      && parsed.includeFavorites !== false;
    if (isLegacyDisabledDefault) return DEFAULT_NOTIFICATION_SETTINGS;
    return {
      enabled: parsed.enabled !== false,
      calendarReminders: parsed.calendarReminders !== false,
      weatherMorningAlerts: parsed.weatherMorningAlerts !== false,
      dustSpikeAlerts: parsed.dustSpikeAlerts !== false,
      // TODO: 利먭꺼李얘린 吏??퉴吏 ?뚮┝???ы븿?섎뒗 湲곕뒫? ?꾩슂?깆씠 ??쑝硫??쒓굅 ?꾨낫?낅땲??
      includeFavorites: parsed.includeFavorites !== false,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

// ?뚮┝??蹂대궪 吏??紐⑸줉???꾩옱 吏??낵 利먭꺼李얘린 ?듭뀡??留욊쾶 以묐났 ?놁씠 留뚮벊?덈떎.
// TODO: 利먭꺼李얘린 吏??퉴吏 ?뚮┝???ы븿?섎뒗 湲곕뒫? ?꾩슂?깆씠 ??쑝硫??쒓굅 ?꾨낫?낅땲??

export function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
