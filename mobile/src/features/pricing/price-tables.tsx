import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/features/auth/session-context';
import { FALLBACK_TABLES, labelOf, validTable, type PriceTable } from '@/features/pricing/price-table-model';
import { api } from '@/infrastructure/api';
import { secureStorage } from '@/infrastructure/storage/secure-storage';

const STORAGE_KEY = 'price-table';

type Value = { tables: PriceTable[]; selected: string; select: (key: string) => void; label: (key: string) => string };

const Context = createContext<Value | null>(null);

// Tabelas da empresa (lidas do ComercialWeb) e a tabela escolhida, que permanece entre telas e aberturas do app.
export function PriceTablesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [tables, setTables] = useState<PriceTable[]>(FALLBACK_TABLES);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let active = true;
    void (async () => {
      try {
        const saved = await secureStorage.get(STORAGE_KEY).catch(() => null);
        if (active) setChosen(saved);
        if (!api) return;
        const res = await api.request<{ tables: PriceTable[] }>('/v1/price-tables');
        if (active && res.tables.length > 0) setTables(res.tables);
      } catch {
        // Sem a lista, o app segue com o varejo; nada trava.
      }
    })();
    return () => {
      active = false;
    };
  }, [status]);

  const select = useCallback((key: string) => {
    setChosen(key);
    void secureStorage.set(STORAGE_KEY, key).catch(() => undefined);
  }, []);

  const selected = validTable(tables, chosen);
  const value = useMemo<Value>(() => ({ tables, selected, select, label: (k) => labelOf(tables, k) }), [tables, selected, select]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePriceTables(): Value {
  const value = useContext(Context);
  if (!value) throw new Error('usePriceTables fora do provider');
  return value;
}
