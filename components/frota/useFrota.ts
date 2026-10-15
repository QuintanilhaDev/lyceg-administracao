'use client';
import { useCallback, useRef, useState } from 'react';
import { api } from '../core/api';
import type { FrotaData } from '@/lib/frota/types';

/** Dados da Frota: carrega tudo de uma vez e só troca o estado quando algo mudou. */
export function useFrota() {
  const [data, setData] = useState<FrotaData | null>(null);
  const [failed, setFailed] = useState(false);
  const last = useRef('');
  const busy = useRef<Promise<void> | null>(null);
  const reload = useCallback(async () => {
    if (busy.current) return busy.current;
    const job = (async () => {
      try {
        const j = await api<FrotaData>('/api/frota');
        const sig = JSON.stringify(j);
        if (sig !== last.current) {
          last.current = sig;
          setData(j);
        }
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        busy.current = null;
      }
    })();
    busy.current = job;
    return job;
  }, []);
  return { data, failed, reload };
}
