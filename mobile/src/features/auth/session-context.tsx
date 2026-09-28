import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { login, logout, type Credentials } from '@/features/auth/auth-api';
import { setUnauthorizedHandler } from '@/infrastructure/api';
import { clearSession, loadSession, saveSession } from '@/infrastructure/security/session-store';

type Status = 'loading' | 'signedOut' | 'signedIn';

type SessionValue = {
  status: Status;
  signIn: (credentials: Credentials, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    loadSession()
      .then((session) => setStatus(session ? 'signedIn' : 'signedOut'))
      .catch(() => setStatus('signedOut'));
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    await clearSession();
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession().finally(() => setStatus('signedOut'));
    });
  }, []);

  const signIn = useCallback(async (credentials: Credentials, remember: boolean) => {
    await saveSession(await login(credentials), remember);
    setStatus('signedIn');
  }, []);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora de SessionProvider');
  return value;
}
