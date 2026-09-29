import { useCallback, useEffect, useState } from 'react';

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

export type PageFetcher<T> = (page: number, search: string) => Promise<Paged<T>>;

type Loaded<T> = { items: T[]; total: number; pageSize: number };
type Cursor = { search: string; page: number };

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Lista com paginação numerada e busca. `fetchPage` deve ter identidade estável (função de módulo ou useCallback).
 * Mudar a busca volta à página 1 (esperando o usuário parar de digitar); trocar de página mantém os itens
 * atuais na tela até a nova página chegar.
 */
export function usePagedList<T>(fetchPage: PageFetcher<T>, search: string) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  // A página pertence a uma busca: outra busca é, por definição, página 1.
  const [cursor, setCursor] = useState<Cursor>({ search, page: 1 });
  const [attempt, setAttempt] = useState(0);
  const page = cursor.search === search ? cursor.page : 1;

  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        fetchPage(page, search)
          .then((r) => {
            if (!active) return;
            setLoaded({ items: r.items, total: r.total, pageSize: r.pageSize });
            setFailure(null);
          })
          .catch((error: unknown) => active && setFailure({ error }));
      },
      search === '' || page > 1 ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fetchPage, search, page, attempt]);

  const goTo = useCallback((next: number) => setCursor({ search, page: next }), [search]);

  const reload = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  // Altera itens já carregados (ex.: marcar como lido) sem nova ida ao servidor.
  const patch = useCallback(
    (change: (items: T[]) => T[]) => setLoaded((l) => (l ? { ...l, items: change(l.items) } : l)),
    [],
  );

  const total = loaded?.total ?? 0;
  const pageSize = loaded?.pageSize ?? 1;
  return {
    items: loaded?.items ?? [],
    status: loaded ? ('ready' as const) : failure ? ('error' as const) : ('loading' as const),
    failed: failure !== null,
    error: failure?.error ?? null,
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    goTo,
    reload,
    patch,
  };
}
