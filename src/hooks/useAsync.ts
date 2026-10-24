import { useCallback, useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ loading: boolean; data: T | null; error: string | null }>({ loading: true, data: null, error: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    fn().then((data) => set({ loading: false, data, error: null }), (e: unknown) => set({ loading: false, data: null, error: e instanceof Error ? e.message : 'Failed' }));
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}
