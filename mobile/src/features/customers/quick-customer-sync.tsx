import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { clearQueue, syncQuickCustomers } from '@/features/customers/quick-customer-queue';

// Sem UI: reenvia a fila ao entrar e sempre que o app volta ao primeiro plano; ao sair da conta a fila é apagada,
// para um cadastro pendente nunca ser enviado depois em nome de outro usuário.
export function QuickCustomerSync() {
  const { status } = useSession();
  useEffect(() => {
    if (status === 'signedOut') {
      clearQueue();
      return;
    }
    if (status !== 'signedIn') return;
    void syncQuickCustomers();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncQuickCustomers());
    return () => sub.remove();
  }, [status]);
  return null;
}
