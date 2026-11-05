// 검색 결과가 하나도 없을 때 오타를 고쳐 한 번 더 찾기 위한 이름 고르기.
// 한글을 자음·모음으로 쪼개 비교해서 '부산녁'(ㄴ↔ㅇ 한 개 차이) → '부산역'처럼 한두 개만 틀린 이름을 찾습니다.
// ponytail: 비교할 이름은 아래 주요 역·공항·명소와 측정소(동네) 이름뿐. 여기 없는 장소 오타는 못 고침 — 자주 틀리는 이름이 보이면 목록에 더하기.

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

export const KNOWN_PLACE_NAMES = [
  '서울역', '용산역', '영등포역', '청량리역', '수서역', '광명역', '행신역', '수원역', '평택역', '천안역', '천안아산역', '오송역',
  '대전역', '서대전역', '김천구미역', '동대구역', '대구역', '신경주역', '경주역', '울산역', '포항역', '부산역', '부전역', '구포역',
  '창원역', '창원중앙역', '마산역', '진주역', '익산역', '전주역', '정읍역', '남원역', '광주역', '광주송정역', '목포역', '순천역',
  '여수엑스포역', '강릉역', '평창역', '원주역', '춘천역', '안동역', '강남역', '홍대입구역', '잠실역', '신촌역', '서면역', '해운대역',
  '인천공항', '김포공항', '김해공항', '제주공항', '대구공항', '청주공항', '광주공항',
  '해운대', '광안리', '남산타워', '경복궁', '롯데월드', '코엑스', '명동', '동대문', '남포동', '여의도', '한강공원',
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

function jamo(text: string) {
  const out: string[] = [];
  for (const char of text.replace(/\s/g, '')) {
    const code = char.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) {
      out.push(char.toLowerCase());
      continue;
    }
    out.push(CHO[Math.floor(code / 588)], JUNG[Math.floor((code % 588) / 28)]);
    if (code % 28) out.push(JONG[code % 28]);
  }
  return out;
}

function editDistance(a: string[], b: string[]) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// 가장 가까운 이름 하나. 짧은 말은 1개, 긴 말은 2개까지만 틀려도 고칩니다(엉뚱한 곳으로 가지 않게). 똑같거나 못 찾으면 null.
export function correctPlaceQuery(query: string, names: readonly string[]) {
  const typed = jamo(query);
  if (typed.length < 4) return null;
  const limit = typed.length <= 7 ? 1 : 2;
  let best: { distance: number; name: string } | null = null;
  for (const name of names) {
    const candidate = jamo(name);
    if (Math.abs(candidate.length - typed.length) > limit) continue;
    const distance = editDistance(typed, candidate);
    if (distance === 0) return null;
    if (distance <= limit && (!best || distance < best.distance)) best = { distance, name };
  }
  return best?.name ?? null;
}
