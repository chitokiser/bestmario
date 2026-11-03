'use client';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export function useUTM() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const utmData: Record<string, string> = {};
    let hasUTM = false;

    UTM_KEYS.forEach((key) => {
      const val = searchParams.get(key);
      if (val) {
        utmData[key] = val;
        hasUTM = true;
      }
    });

    if (hasUTM) {
      try {
        localStorage.setItem(
          'bestmario_utm',
          JSON.stringify({ ...utmData, captured_at: new Date().toISOString() })
        );
      } catch {
        // localStorage not available (private browsing etc.)
      }
    }
  }, [searchParams]);
}
