import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchProfile, login, logout, type Credentials, type Profile } from '@/features/auth/auth-api';
import { setUnauthorizedHandler } from '@/infrastructure/api';
import { clearSession, loadSession, saveSession } from '@/infrastructure/security/session-store';

type Status = 'loading' | 'signedOut' | 'signedIn';

type SessionValue = {
  status: Status;
  // null enquanto carrega ou se a consulta falhar; telas mostram marcador neutro.
  profile: Profile | null;
  signIn: (credentials: Credentials, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadSession()
      .then((session) => setStatus(session ? 'signedIn' : 'signedOut'))
      .catch(() => setStatus('signedOut'));
  }, []);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let active = true;
    fetchProfile()
      .then((p) => active && setProfile(p))
      .catch(() => undefined); // 401 já dispara logout pelo handler; demais erros mantêm o marcador.
    return () => {
      active = false;
      setProfile(null);
    };
  }, [status]);

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

  const value = useMemo(() => ({ status, profile, signIn, signOut }), [status, profile, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora de SessionProvider');
  return value;
}
