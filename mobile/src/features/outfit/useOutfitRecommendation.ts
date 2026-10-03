import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiHttpError, postOutfitRecommendation } from '../../api/dustEndpoints';
import type { CalendarEvent, OutfitRecommendation, OutfitSensitivity } from '../../types/dust';
import { getCachedOutfit, getLastOutfit, outfitCacheKey, setCachedOutfit } from './outfitCache';

export type OutfitLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export function useOutfitRecommendation({ enabled, event, sensitivity }: {
  enabled: boolean;
  event: CalendarEvent;
  sensitivity: OutfitSensitivity;
}) {
  const key = useMemo(() => outfitCacheKey(event.id, event.date, event.time, sensitivity), [event.date, event.id, event.time, sensitivity]);
  const [result, setResult] = useState<OutfitRecommendation | null>(() => getCachedOutfit(key));
  const [status, setStatus] = useState<OutfitLoadStatus>(enabled ? 'loading' : 'idle');
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
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
    setStatus('loading');
    const load = async () => {
      try {
        const rule = await postOutfitRecommendation({ event, mode: 'rule', sensitivity, signal: controller.signal });
        if (!mounted) return;
        setResult(rule);
        setCachedOutfit(key, rule);
        setStatus('ready');
        const full = await postOutfitRecommendation({ event, mode: 'full', sensitivity, signal: controller.signal });
        if (!mounted) return;
        setResult(full);
        setCachedOutfit(key, full);
      } catch (error) {
        if (!mounted || controller.signal.aborted) return;
        const last = getLastOutfit(key);
        if (last) setResult(last);
        setStatus(error instanceof ApiHttpError && error.status === 503 ? 'unavailable' : 'error');
      }
    };
    void load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [enabled, event, key, retryVersion, sensitivity]);

  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);
  return { result, retry, status };
}
