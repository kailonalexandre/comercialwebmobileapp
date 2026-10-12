import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { fetchProfile, logout, pair, switchBusinessRequest, type Profile } from '@/features/auth/auth-api';
import { unregisterPush } from '@/features/push/register-push';
import { setMinVersionHandler, setUnauthorizedHandler } from '@/infrastructure/api';
import { isOutdated } from '@/infrastructure/app-version';
import { loadActiveBusinessId, setActiveBusinessId } from '@/infrastructure/business-scope';
import { biometricAvailable, confirmBiometric, offerBiometric } from '@/features/auth/biometric';
import {
  clearSession, createAccount, describeAccount, loadAccounts, lockSession, openAccount, removeAccount as removeStoredAccount, replaceAccessToken, setAccountBiometric,
  getActiveAccountId, type Account,
} from '@/infrastructure/security/session-store';

// locked: há contas no aparelho, nenhuma aberta (escolha de conta, com biometria se a conta pediu).
type Status = 'loading' | 'signedOut' | 'locked' | 'signedIn';

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
  // Contas guardadas no aparelho e a aberta agora (null fora de signedIn).
  accounts: Account[];
  activeAccountId: string | null;
  // Abre a conta; com biometria ativa pede a digital/rosto antes. false = não liberou (recusou ou sessão perdida).
  unlock: (id: string) => Promise<boolean>;
  // Volta à escolha de conta sem apagar nada (troca de usuário).
  lock: () => Promise<void>;
  // Leitura de outro QR para outra conta / desistir e voltar à escolha.
  startAdding: () => void;
  cancelAdding: () => void;
  removeAccount: (id: string) => Promise<void>;
  // Biometria da conta aberta. Ligar confirma na hora; false = aparelho sem biometria ou não confirmou.
  setBiometric: (on: boolean) => Promise<boolean>;
  // Sobe a cada troca de empresa: as telas e os dados em memória são recriados com esta chave, sem mistura entre empresas.
  businessEpoch: number;
  // Troca a empresa ativa sem sair da conta (a API confere o vínculo). Falha chega ao chamador e nada muda.
  switchBusiness: (businessId: number) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [businessEpoch, setBusinessEpoch] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Conta que acabou de parear: o perfil, quando chegar, completa o nome dela e oferece a biometria.
  const justPaired = useRef(false);

  const open = useCallback(async (id: string) => {
    const session = await openAccount(id);
    if (!session) return false;
    setUpdateRequired(isOutdated(appVersion, session.minAppVersion));
    setStatus('signedIn');
    return true;
  }, []);

  useEffect(() => {
    // A empresa ativa vem guardada: o app abre offline já na empresa certa (cópias e filas são por empresa).
    Promise.all([loadAccounts(), loadActiveBusinessId()])
      .then(async ([list]) => {
        setAccounts(list);
        // Uma conta só e sem biometria: abre direto, como antes. Qualquer outro caso passa pela escolha de conta.
        if (list.length === 1 && !list[0]!.biometric && (await open(list[0]!.id))) return;
        setStatus(list.length > 0 ? 'locked' : 'signedOut');
      })
      .catch(() => setStatus('signedOut'));
  }, [open]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let active = true;
    fetchProfile()
      .then((p) => {
        if (!active) return;
        // A API é quem diz qual é a empresa da sessão; as cópias locais seguem essa resposta.
        void setActiveBusinessId(p.businessId);
        setProfile(p);
        if (justPaired.current) {
          justPaired.current = false;
          void describeAccount(p.userName, p.businessName).then(async (list) => {
            setAccounts(list);
            const id = getActiveAccountId();
            if (id && (await offerBiometric(p.userName))) setAccounts(await setAccountBiometric(id, true));
          });
        }
      })
      .catch(() => undefined); // 401 já dispara logout pelo handler; demais erros mantêm o marcador.
    return () => {
      active = false;
      setProfile(null);
    };
  }, [status, businessEpoch]);

  // Sai da conta aberta (some do aparelho) e volta à escolha das que restam, ou ao QR se não restar nenhuma.
  const leave = useCallback(async () => {
    const left = await clearSession();
    await setActiveBusinessId(null);
    setAccounts(left);
    setUpdateRequired(false);
    setStatus(left.length > 0 ? 'locked' : 'signedOut');
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush(); // ainda autenticado; melhor esforço
    await logout();
    await leave();
  }, [leave]);

  useEffect(() => {
    setUnauthorizedHandler(() => void leave());
  }, [leave]);

  const lock = useCallback(async () => {
    await unregisterPush(); // as notificações são de quem está usando; o próximo usuário registra as dele
    lockSession();
    await setActiveBusinessId(null);
    setUpdateRequired(false);
    setStatus('locked');
  }, []);

  const unlock = useCallback(
    async (id: string) => {
      const account = accounts.find((a) => a.id === id);
      if (account?.biometric && !(await confirmBiometric(`Entrar como ${account.userName}`))) return false;
      return open(id);
    },
    [accounts, open],
  );

  const removeAccount = useCallback(async (id: string) => {
    const left = await removeStoredAccount(id);
    setAccounts(left);
    if (left.length === 0) setStatus('signedOut');
  }, []);

  const setBiometric = useCallback(async (on: boolean) => {
    const id = getActiveAccountId();
    if (!id) return false;
    if (on && !((await biometricAvailable()) && (await confirmBiometric('Confirme para ativar o acesso biométrico')))) return false;
    setAccounts(await setAccountBiometric(id, on));
    return true;
  }, []);

  useEffect(() => {
    setMinVersionHandler((minimum) => setUpdateRequired(isOutdated(appVersion, minimum)));
  }, []);

  const connect = useCallback(async (code: string, deviceName: string) => {
    const session = await pair(code, deviceName);
    await createAccount(session);
    justPaired.current = true;
    setUpdateRequired(isOutdated(appVersion, session.minAppVersion));
    setStatus('signedIn');
  }, []);

  const switchBusiness = useCallback(async (businessId: number) => {
    const switched = await switchBusinessRequest(businessId);
    await replaceAccessToken(switched.accessToken, switched.expiresAt);
    await setActiveBusinessId(switched.businessId);
    setProfile(null);
    setBusinessEpoch((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ status, updateRequired, profile, connect, signOut, accounts, activeAccountId: status === 'signedIn' ? getActiveAccountId() : null, unlock, lock, startAdding: () => setStatus('signedOut'), cancelAdding: () => setStatus('locked'), removeAccount, setBiometric, businessEpoch, switchBusiness }),
    [status, updateRequired, profile, connect, signOut, accounts, unlock, lock, removeAccount, setBiometric, businessEpoch, switchBusiness],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora de SessionProvider');
  return value;
}
