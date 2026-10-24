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
  const [result, setResult] = useState<OutfitRecommendation | null>(() => getCachedOutfit(key));
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
      setResult(cached);
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
        setResult(next);
        setCachedOutfit(key, next);
        setStatus('ready');
        autoRetryAttemptRef.current = 0;
      } catch (error) {
        if (!mounted || controller.signal.aborted) return;
        const last = getLastOutfit(key);
        if (last) {
          setResult(last);
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
  return { result, retry, status };
}
