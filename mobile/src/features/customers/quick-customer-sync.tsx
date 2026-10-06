import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { clearCustomerCache, refreshCustomerCache } from '@/features/customers/customer-cache';
import { clearQueue, syncQuickCustomers, useQuickCustomerQueue } from '@/features/customers/quick-customer-queue';

// Sem UI: mantém a cópia local de clientes (offline) e reenvia a fila ao entrar e sempre que o app volta ao primeiro plano; ao sair da conta a fila e a cópia de clientes são apagadas,
// para um cadastro pendente nunca ser enviado depois em nome de outro usuário.
export function QuickCustomerSync() {
  const { status } = useSession();
  const waiting = useQuickCustomerQueue().some((e) => e.status === 'pending');
  useEffect(() => {
    if (status === 'signedOut') {
      clearQueue();
      clearCustomerCache();
      return;
    }
    if (status !== 'signedIn') return;
    void syncQuickCustomers();
    void refreshCustomerCache();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && (void syncQuickCustomers(), void refreshCustomerCache()));
    // Cadastro feito offline: tenta de novo a cada 30 s e, ao subir, atualiza a cópia para o cliente novo já aparecer na busca.
    const timer = waiting ? setInterval(() => void syncQuickCustomers().then(() => refreshCustomerCache(true)), 30_000) : undefined;
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [status, waiting]);
  return null;
}
