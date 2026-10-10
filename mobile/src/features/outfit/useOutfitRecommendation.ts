import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiHttpError, postDailyOutfitRecommendation, postOutfitRecommendation } from '../../api/dustEndpoints';
import type { CalendarEvent, OutfitRecommendation, OutfitSensitivity } from '../../types/dust';
import { clearCachedOutfit, getCachedOutfit, getLastOutfit, outfitCacheKeyForEvents, setCachedOutfit } from './outfitCache';

export type OutfitLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

const AUTO_RETRY_DELAYS_MS = [1500, 4000, 8000] as const;

function isRetryableOutfitError(error: unknown) {
  return !(error instanceof ApiHttpError) || error.status === 503 || error.status >= 500;
}

export function useOutfitRecommendation({ enabled, enhanceWithLlm = false, events, sensitivity }: {
  enabled: boolean;
  enhanceWithLlm?: boolean;
  events: CalendarEvent[];
  sensitivity: OutfitSensitivity;
}) {
  const key = useMemo(() => outfitCacheKeyForEvents(events, sensitivity), [events, sensitivity]);
  const [result, setResult] = useState<OutfitRecommendation | null>(() => getCachedOutfit(key));
  const [status, setStatus] = useState<OutfitLoadStatus>(enabled ? 'loading' : 'idle');
  const [retryVersion, setRetryVersion] = useState(0);
  // 기본(규칙) 추천을 보여 준 뒤 AI(LLM) 추천을 기다리는 중인지. 화면에 'AI가 고르는 중'을 띄우는 데 씁니다.
  const [isEnhancing, setIsEnhancing] = useState(false);
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
      if (!enhanceWithLlm || cached.source === 'llm') return;
    }
    const controller = new AbortController();
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setStatus('loading');
    const request = (mode: 'rule' | 'full') => events.length > 1
      ? postDailyOutfitRecommendation({ events, mode, sensitivity, signal: controller.signal })
      : postOutfitRecommendation({ event: events[0], mode, sensitivity, signal: controller.signal });
    const load = async () => {
      try {
        if (!cached) {
          const rule = await request('rule');
          if (!mounted) return;
          setResult(rule);
          setCachedOutfit(key, rule);
          setStatus('ready');
          autoRetryAttemptRef.current = 0;
        }
        if (!enhanceWithLlm) return;
        setIsEnhancing(true);
        const full = await request('full');
        if (!mounted) return;
        setResult(full);
        setCachedOutfit(key, full);
        setIsEnhancing(false);
        setStatus('ready');
        autoRetryAttemptRef.current = 0;
      } catch (error) {
        if (mounted) setIsEnhancing(false);
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
      setIsEnhancing(false);
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, enhanceWithLlm, events, key, retryVersion, sensitivity]);

  const retry = useCallback(() => {
    autoRetryAttemptRef.current = 0;
    clearCachedOutfit(key);
    setRetryVersion((value) => value + 1);
  }, [key]);
  return { isEnhancing, result, retry, status };
}
