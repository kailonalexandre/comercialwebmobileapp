import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchProfile, logout, pair, type Profile } from '@/features/auth/auth-api';
import { unregisterPush } from '@/features/push/register-push';
import { setMinVersionHandler, setUnauthorizedHandler } from '@/infrastructure/api';
import { isOutdated } from '@/infrastructure/app-version';
import { clearSession, loadSession, saveSession } from '@/infrastructure/security/session-store';

type Status = 'loading' | 'signedOut' | 'signedIn';

const appVersion = Constants.expoConfig?.version ?? '0.0.0';

type SessionValue = {
  status: Status;
  // Versão do app abaixo da mínima do servidor: a navegação mostra só a tela de atualização.
  updateRequired: boolean;
  // null enquanto carrega ou se a consulta falhar; telas mostram marcador neutro.
  profile: Profile | null;
  // Entra com o código lido do QR; falha (inválido/expirado/rede) chega ao chamador.
  connect: (code: string, deviceName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [updateRequired, setUpdateRequired] = useState(false);

  useEffect(() => {
    loadSession()
      .then((session) => {
        setUpdateRequired(isOutdated(appVersion, session?.minAppVersion));
        setStatus(session ? 'signedIn' : 'signedOut');
      })
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
    await unregisterPush(); // ainda autenticado; melhor esforço
    await logout();
    await clearSession();
    setUpdateRequired(false);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession().finally(() => {
        setUpdateRequired(false);
        setStatus('signedOut');
      });
    });
  }, []);

  useEffect(() => {
    setMinVersionHandler((minimum) => setUpdateRequired(isOutdated(appVersion, minimum)));
  }, []);

  const connect = useCallback(async (code: string, deviceName: string) => {
    const session = await pair(code, deviceName);
    await saveSession(session);
    setUpdateRequired(isOutdated(appVersion, session.minAppVersion));
    setStatus('signedIn');
  }, []);

  const value = useMemo(() => ({ status, updateRequired, profile, connect, signOut }), [status, updateRequired, profile, connect, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora de SessionProvider');
  return value;
}
