import { useCallback, useEffect, useState } from 'react';

export type DetailFailure = 'not_found' | 'error';

type State<T> = { data: T | null; failure: DetailFailure | null; error: unknown };

/** Carrega um registro. `fetcher` deve ter identidade estável (troca = nova carga). */
export function useDetail<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, failure: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetcher()
      .then((data) => active && setState({ data, failure: null, error: null }))
      .catch((error: { kind?: string }) => active && setState({ data: null, failure: error.kind === 'not_found' ? 'not_found' : 'error', error }));
    return () => {
      active = false;
    };
  }, [fetcher, attempt]);

  const reload = useCallback(() => {
    setState({ data: null, failure: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
