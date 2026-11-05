import { useEffect, useRef } from 'react';

// 키보드 검색 버튼: 맨 위 결과로 바로 갑니다. 아직 찾는 중이면 결과가 오자마자 갑니다('부산역' 치고 바로 눌러도 되게).
// 검색어를 바꾸면(searchText) 기다리던 것은 취소합니다.
export function useSubmitTopResult<T>(results: T[], isSearching: boolean, searchText: string, onPick: (result: T) => void) {
  const pendingRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    pendingRef.current = false;
  }, [searchText]);

  useEffect(() => {
    if (!pendingRef.current || isSearching) return;
    pendingRef.current = false;
    if (results[0]) onPickRef.current(results[0]);
  }, [isSearching, results]);

  return () => {
    if (!searchText.trim()) return;
    if (!isSearching && results[0]) onPickRef.current(results[0]);
    else pendingRef.current = true;
  };
}
