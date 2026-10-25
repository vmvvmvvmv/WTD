import { useCallback, useEffect, useRef, useState } from 'react';

// 아래쪽 토스트. 보여 준 뒤 지운다. 남겨 두면 탭을 옮길 때 다시 그려지면서 예전 문구가 또 뜬다.
// id는 같은 문구를 연달아 보내도(예: 테스트 알림 두 번) 다시 띄우기 위한 값이다.
export function useToast() {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastIdRef = useRef(0);
  const showToast = useCallback((message: string) => {
    toastIdRef.current += 1;
    setToast(message ? { id: toastIdRef.current, message } : null);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  return { showToast, toast };
}
