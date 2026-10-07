import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { clearProductCache, refreshProductCache } from '@/features/catalog/product-cache';
import { usePriceTables } from '@/features/pricing/price-tables';

// Sem UI: mantém a cópia local de produtos (para vender sem conexão) ao entrar e ao voltar ao primeiro plano.
// Ao sair da conta a cópia é apagada.
export function ProductCacheSync() {
  const { status, profile } = useSession();
  const businessId = profile?.businessId;
  const { tables } = usePriceTables();
  const keys = tables.map((t) => t.key).join(',');
  useEffect(() => {
    const list = keys.split(',');
    if (status === 'signedOut') {
      clearProductCache();
      return;
    }
    if (status !== 'signedIn') return;
    void refreshProductCache(list);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refreshProductCache(list));
    return () => sub.remove();
  }, [status, keys, businessId]);
  return null;
}
