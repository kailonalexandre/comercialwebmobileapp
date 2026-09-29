import { useCallback, useEffect, useState } from 'react';

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

export type PageFetcher<T> = (page: number, search: string) => Promise<Paged<T>>;

type State<T> = { items: T[]; page: number; total: number; status: 'loading' | 'ready' | 'error'; loadingMore: boolean };

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Lista paginada com busca. `fetchPage` deve ter identidade estável (função de módulo ou useCallback).
 * A busca espera o usuário parar de digitar; ao mudar, mantém os itens antigos até chegarem os novos.
 * ponytail: se a busca mudar durante um "carregar mais", a página antiga ainda é anexada; cancelar com AbortSignal se incomodar.
 */
export function usePagedList<T>(fetchPage: PageFetcher<T>, search: string) {
  const [state, setState] = useState<State<T>>({ items: [], page: 0, total: 0, status: 'loading', loadingMore: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        fetchPage(1, search)
          .then((r) => active && setState({ items: r.items, page: 1, total: r.total, status: 'ready', loadingMore: false }))
          .catch(() => active && setState((s) => ({ ...s, status: 'error', loadingMore: false })));
      },
      search === '' ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fetchPage, search, attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    setAttempt((n) => n + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (state.status !== 'ready' || state.loadingMore || state.items.length >= state.total) return;
    setState((s) => ({ ...s, loadingMore: true }));
    fetchPage(state.page + 1, search)
      .then((r) =>
        setState((s) => ({ items: [...s.items, ...r.items], page: r.page, total: r.total, status: 'ready', loadingMore: false })),
      )
      .catch(() => setState((s) => ({ ...s, loadingMore: false })));
  }, [fetchPage, search, state]);

  return { ...state, reload, loadMore };
}
