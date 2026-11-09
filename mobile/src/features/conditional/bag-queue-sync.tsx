import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncBagMoves, useBagQueue } from '@/features/conditional/bag-queue';
import { useSession } from '@/features/auth/session-context';

// Mesma cadência da fila de vendas: ao entrar, ao voltar ao primeiro plano e a cada 30 s enquanto houver baixa esperando.
const RETRY_MS = 30_000;

export function BagQueueSync() {
  const { status } = useSession();
  const waiting = useBagQueue().some((m) => m.status === 'pending');

  useEffect(() => {
    if (status !== 'signedIn') return;
    void syncBagMoves();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncBagMoves());
    const timer = waiting ? setInterval(() => void syncBagMoves(), RETRY_MS) : undefined;
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [status, waiting]);
  return null;
}
