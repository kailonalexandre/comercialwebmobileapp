import { useEffect, useState } from 'react';

import { onUnreadChanged } from '@/features/shell/unread-events';
import { api } from '@/infrastructure/api';

// Contador do sino. Falha ou API ausente = 0: o badge é conveniência, nunca bloqueia a tela.
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => onUnreadChanged(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!api) return;
    let active = true;
    api
      .request<{ count: number }>('/v1/notifications/unread-count')
      .then((r) => active && setCount(r.count))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [version]);

  return count;
}
