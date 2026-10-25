import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiHttpError, postDailyOutfitRecommendation, postOutfitRecommendation } from '../../api/dustEndpoints';
import type { CalendarEvent } from '../../types/calendar';
import type { OutfitRecommendation, OutfitSensitivity } from '../../types/outfit';
import { clearCachedOutfit, getCachedOutfit, getLastOutfit, outfitCacheKeyForEvents, setCachedOutfit } from './outfitCache';

export type OutfitLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

const AUTO_RETRY_DELAYS_MS = [1500, 4000, 8000] as const;

function isRetryableOutfitError(error: unknown) {
  return !(error instanceof ApiHttpError) || error.status === 503 || error.status >= 500;
}

export function useOutfitRecommendation({ enabled, events, sensitivity }: {
  enabled: boolean;
  events: CalendarEvent[];
  sensitivity: OutfitSensitivity;
}) {
  const key = useMemo(() => outfitCacheKeyForEvents(events, sensitivity), [events, sensitivity]);
  // 결과가 어느 요청(일정·체감 성향)의 것인지 함께 둔다. 일정이 바뀌면 새 결과가 올 때까지 이전 일정의 추천을 보여 주지 않는다.
  const [resultEntry, setResultEntry] = useState<{ key: string; value: OutfitRecommendation } | null>(() => {
    const cached = getCachedOutfit(key);
    return cached ? { key, value: cached } : null;
  });
  const [status, setStatus] = useState<OutfitLoadStatus>(enabled ? 'loading' : 'idle');
  const [retryVersion, setRetryVersion] = useState(0);
  const autoRetryAttemptRef = useRef(0);

  useEffect(() => {
    autoRetryAttemptRef.current = 0;
  }, [key]);

  useEffect(() => {
    if (!enabled || events.length === 0) {
      setStatus('idle');
      return;
    }
    const cached = getCachedOutfit(key);
    if (cached) {
      setResultEntry({ key, value: cached });
      setStatus('ready');
      return;
    }
    const controller = new AbortController();
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setStatus('loading');
    const load = async () => {
      try {
        const next = events.length > 1
          ? await postDailyOutfitRecommendation({ events, sensitivity, signal: controller.signal })
          : await postOutfitRecommendation({ event: events[0], sensitivity, signal: controller.signal });
        if (!mounted) return;
        setResultEntry({ key, value: next });
        setCachedOutfit(key, next);
        setStatus('ready');
        autoRetryAttemptRef.current = 0;
      } catch (error) {
        if (!mounted || controller.signal.aborted) return;
        const last = getLastOutfit(key);
        if (last) {
          setResultEntry({ key, value: last });
          setStatus('ready');
          return;
        }
        if (isRetryableOutfitError(error) && autoRetryAttemptRef.current < AUTO_RETRY_DELAYS_MS.length) {
          const delay = AUTO_RETRY_DELAYS_MS[autoRetryAttemptRef.current];
          autoRetryAttemptRef.current += 1;
          setStatus('loading');
          retryTimer = setTimeout(() => {
            if (mounted) setRetryVersion((value) => value + 1);
          }, delay);
          return;
        }
        setStatus(error instanceof ApiHttpError && error.status === 503 ? 'unavailable' : 'error');
      }
    };
    void load();
    return () => {
      mounted = false;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, events, key, retryVersion, sensitivity]);

  const retry = useCallback(() => {
    autoRetryAttemptRef.current = 0;
    clearCachedOutfit(key);
    setRetryVersion((value) => value + 1);
  }, [key]);
  return { result: resultEntry?.key === key ? resultEntry.value : null, retry, status };
}
