import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { secureStorage } from '@/infrastructure/storage/secure-storage';

const KEY = 'cw.onboarding';

type OnboardingValue = { seen: boolean | null; complete: () => void };

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    secureStorage
      .get(KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(false));
  }, []);

  const complete = useCallback(() => {
    setSeen(true);
    // Falha ao gravar só faz o onboarding reaparecer; não bloqueia o uso.
    secureStorage.set(KEY, '1').catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ seen, complete }), [seen, complete]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding fora de OnboardingProvider');
  return value;
}
