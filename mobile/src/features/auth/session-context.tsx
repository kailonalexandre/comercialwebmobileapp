import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchProfile, logout, pair, type Profile } from '@/features/auth/auth-api';
import { setUnauthorizedHandler } from '@/infrastructure/api';
import { clearSession, loadSession, saveSession } from '@/infrastructure/security/session-store';

type Status = 'loading' | 'signedOut' | 'signedIn';

type SessionValue = {
  status: Status;
  // null enquanto carrega ou se a consulta falhar; telas mostram marcador neutro.
  profile: Profile | null;
  // Entra com o código lido do QR; falha (inválido/expirado/rede) chega ao chamador.
  connect: (code: string) => Promise<void>;
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

  const connect = useCallback(async (code: string) => {
    await saveSession(await pair(code));
    setStatus('signedIn');
  }, []);

  const value = useMemo(() => ({ status, profile, connect, signOut }), [status, profile, connect, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora de SessionProvider');
  return value;
}
