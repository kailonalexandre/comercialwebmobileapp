import { useCallback, useEffect, useState } from 'react';

import { fetchDashboard } from '@/features/dashboard/dashboard-api';
import type { Dashboard } from '@/features/dashboard/dashboard-model';

type State = { data: Dashboard | null; failed: boolean };

// Mantém o último dado visível ao atualizar ou falhar; erro só bloqueia a tela quando nunca houve dado.
export function useDashboard() {
  const [state, setState] = useState<State>({ data: null, failed: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchDashboard()
      .then((data) => active && setState({ data, failed: false }))
      .catch(() => active && setState((s) => ({ ...s, failed: true })));
    return () => {
      active = false;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, failed: false }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
