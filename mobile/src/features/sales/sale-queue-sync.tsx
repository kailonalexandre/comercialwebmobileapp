import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/features/auth/session-context';
import { syncSales, useSaleQueue } from '@/features/sales/sale-queue';

// Sem conexão a venda fica na fila; aqui ela é reenviada ao entrar, ao voltar ao primeiro plano e a cada 30 s
// enquanto houver pendente (sem biblioteca de rede: tentar é barato e o servidor deduplica pela chave).
// A fila NÃO é apagada ao sair da conta: venda feita offline nunca se perde, e só sobe na empresa que a gravou.
const RETRY_MS = 30_000;

export function SaleQueueSync() {
  const { status, profile } = useSession();
  const waiting = useSaleQueue().some((e) => e.status === 'pending');
  const businessId = profile?.businessId;

  useEffect(() => {
    if (status !== 'signedIn') return;
    void syncSales(businessId);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncSales(businessId));
    const timer = waiting ? setInterval(() => void syncSales(businessId), RETRY_MS) : undefined;
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [status, businessId, waiting]);
  return null;
}
