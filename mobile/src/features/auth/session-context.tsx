import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import {
  bindTerminal, fetchProfile, fetchTerminalState, logout, pair, switchBusinessRequest, terminalLogin, type LoginInput, type Operator, type Profile,
} from '@/features/auth/auth-api';
import {
  askBiometric, biometricAvailable, confirmBiometric, dropBiometricKey, enrollBiometricKey, offerBiometric, verifyBiometricKey,
} from '@/features/auth/biometric';
import { pendingBagAccounts } from '@/features/conditional/bag-queue';
import { pendingCustomerAccounts } from '@/features/customers/quick-customer-queue';
import { unregisterPush } from '@/features/push/register-push';
import { pendingSaleAccounts } from '@/features/sales/sale-queue';
import { setMinVersionHandler, setUnauthorizedHandler } from '@/infrastructure/api';
import { ApiError } from '@/infrastructure/api/client';
import { isOutdated } from '@/infrastructure/app-version';
import { loadActiveBusinessId, setActiveBusinessId } from '@/infrastructure/business-scope';
import {
  accountIdFor, clearSession, createAccount, describeAccount, forgetTokens, getActiveAccount, getActiveAccountId, loadAccounts, lockSession, openAccount,
  removeAccount as removeStoredAccount, replaceAccessToken, setAccountBiometric, type Account, type SessionPolicy,
} from '@/infrastructure/security/session-store';
import { clearTerminal, loadTerminal, saveTerminal, type Terminal } from '@/infrastructure/security/terminal-store';

// locked: há contas/aparelho vinculado, nenhuma sessão aberta (escolha de conta ou de operador).
// revoked: o aparelho foi desvinculado no ComercialWeb (tokens já apagados; filas offline preservadas).
type Status = 'loading' | 'signedOut' | 'locked' | 'signedIn' | 'revoked';

const appVersion = Constants.expoConfig?.version ?? '0.0.0';

export const isTerminalRevoked = (e: unknown) => e instanceof ApiError && e.status === 403 && e.refusal?.code === 'terminal_revoked';

// Contas com operação offline ainda não sincronizada: vincular/desvincular o aparelho espera elas subirem.
async function pendingAccounts(): Promise<Set<string>> {
  const [sales, bags, customers] = await Promise.all([pendingSaleAccounts(), pendingBagAccounts(), pendingCustomerAccounts()]);
  return new Set([...sales, ...bags, ...customers]);
}

// Logo após abrir (aparelho recém-desbloqueado, Keystore ocupado) a leitura do Keychain/Keystore pode falhar de forma
// transitória. Tenta de novo antes de concluir que não há conta: senão o app mostraria a tela de vínculo com a sessão guardada.
export async function readStored(attempts = 3, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  for (let n = 1; ; n++) {
    try {
      return await Promise.all([loadAccounts(), loadActiveBusinessId(), loadTerminal()]);
    } catch (e) {
      if (n >= attempts) throw e;
      await wait(400 * n);
    }
  }
}

export class PendingOperationsError extends Error {
  constructor() {
    super('Há operações ainda não sincronizadas neste aparelho.');
    this.name = 'PendingOperationsError';
  }
}

type SessionValue = {
  status: Status;
  // Versão do app abaixo da mínima do servidor: a navegação mostra só a tela de atualização.
  updateRequired: boolean;
  // null enquanto carrega ou se a consulta falhar; telas mostram marcador neutro.
  profile: Profile | null;
  // QR antigo (transição): entra com a sessão de quem gerou o QR.
  connect: (code: string, deviceName: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Contas guardadas no aparelho e a aberta agora (null fora de signedIn).
  accounts: Account[];
  activeAccountId: string | null;
  // Abre a conta; com biometria ativa pede a digital/rosto antes. false = não liberou (recusou ou sessão perdida).
  unlock: (id: string) => Promise<boolean>;
  // Volta à escolha de conta (pessoal: sem apagar nada; compartilhado: encerra a sessão = troca de operador).
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
  // Aparelho vinculado (QR de vínculo) e as regras da sessão aberta nele.
  terminal: Terminal | null;
  policy: SessionPolicy | null;
  // Aviso para a tela de entrada (sessão expirada, bloqueio por inatividade).
  notice: string | null;
  bind: (code: string, deviceName: string) => Promise<Terminal>;
  login: (input: LoginInput) => Promise<void>;
  // Confere no servidor se o aparelho segue vinculado e devolve quem pode entrar (null = sem conexão ou desvinculado).
  checkTerminal: () => Promise<Operator[] | null>;
  // Remove o vínculo só deste aparelho (o administrador revoga no painel). Recusa com operações pendentes.
  unbind: () => Promise<void>;
  // Toque na tela: zera o relógio do bloqueio por inatividade.
  touch: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [businessEpoch, setBusinessEpoch] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Cópia para callbacks estáveis; atualizada junto com cada setTerminal (nunca durante o render).
  const terminalRef = useRef<Terminal | null>(null);
  const putTerminal = useCallback((t: Terminal | null) => {
    terminalRef.current = t;
    setTerminal(t);
  }, []);
  // Conta que acabou de parear pelo QR antigo: o perfil, quando chegar, completa o nome dela e oferece a biometria.
  const justPaired = useRef(false);
  const lastActivity = useRef(0);

  const open = useCallback(async (id: string) => {
    const session = await openAccount(id);
    if (!session) return false;
    setUpdateRequired(isOutdated(appVersion, session.minAppVersion));
    setNotice(null);
    setStatus('signedIn');
    return true;
  }, []);

  /** Desvinculado no painel: tokens de todas as contas deste aparelho somem; nomes e filas offline ficam. */
  const revokeLocal = useCallback(async () => {
    const list = await loadAccounts();
    await Promise.all(list.filter((a) => a.terminalId).map((a) => forgetTokens(a.id)));
    await clearTerminal();
    lockSession();
    await setActiveBusinessId(null);
    putTerminal(null);
    setAccounts(await loadAccounts());
    setStatus('revoked');
  }, [putTerminal]);

  const checkTerminal = useCallback(async () => {
    const t = terminalRef.current;
    if (!t) return null;
    try {
      return (await fetchTerminalState(t)).operators;
    } catch (e) {
      if (isTerminalRevoked(e)) await revokeLocal();
      return null;
    }
  }, [revokeLocal]);

  useEffect(() => {
    // A empresa ativa vem guardada: o app abre offline já na empresa certa (cópias e filas são por empresa).
    readStored()
      .then(async ([list, , bound]) => {
        setAccounts(list);
        if (bound) {
          // Aparelho vinculado: sempre passa pela entrada (biometria no pessoal, operador no compartilhado).
          putTerminal(bound);
          setStatus('locked');
          return;
        }
        // QR antigo, uma conta só e sem biometria: abre direto, como antes.
        if (list.length === 1 && !list[0]!.biometric && (await open(list[0]!.id))) return;
        setStatus(list.length > 0 ? 'locked' : 'signedOut');
      })
      .catch(() => setStatus('signedOut'));
  }, [open, putTerminal]);

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

  /** Encerra a sessão aberta num aparelho vinculado e volta à entrada. Os tokens saem do aparelho. */
  const endTerminalSession = useCallback(async (reason: 'operator_switch' | 'idle' | null, message: string | null) => {
    const id = getActiveAccountId();
    await unregisterPush(); // as notificações são de quem está usando; o próximo registra as dele
    if (reason !== null) await logout(reason);
    if (id) await forgetTokens(id);
    lockSession();
    await setActiveBusinessId(null);
    setUpdateRequired(false);
    setAccounts(await loadAccounts());
    setNotice(message);
    setStatus('locked');
  }, []);

  // Sai da conta aberta (some do aparelho) e volta à escolha das que restam, ou ao QR se não restar nenhuma.
  const leave = useCallback(async () => {
    const left = await clearSession();
    await setActiveBusinessId(null);
    setAccounts(left);
    setUpdateRequired(false);
    setStatus(terminalRef.current || left.length > 0 ? 'locked' : 'signedOut');
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPush(); // ainda autenticado; melhor esforço
    await logout();
    await leave();
  }, [leave]);

  useEffect(() => {
    // Refresh recusado (sessão expirada, revogada ou reusada). No aparelho vinculado a conta continua listada e a
    // entrada confere se foi o aparelho inteiro que caiu (revogação).
    setUnauthorizedHandler(() => {
      if (getActiveAccount()?.terminalId && terminalRef.current) void endTerminalSession(null, 'Sua sessão terminou. Entre de novo.');
      else void leave();
    });
  }, [leave, endTerminalSession]);

  const lock = useCallback(async () => {
    const policy = getActiveAccount()?.policy;
    // Compartilhado: trocar de operador encerra a sessão (ninguém herda o acesso do anterior).
    if (policy?.mode === 'shared') return endTerminalSession('operator_switch', null);
    await unregisterPush();
    lockSession();
    await setActiveBusinessId(null);
    setUpdateRequired(false);
    setStatus('locked');
  }, [endTerminalSession]);

  // Bloqueio por inatividade, no tempo que o servidor mandou para o modo do aparelho. Só sessões de aparelho vinculado.
  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);
  useEffect(() => {
    const policy = getActiveAccount()?.policy;
    if (status !== 'signedIn' || !policy) return;
    lastActivity.current = Date.now();
    const check = () => {
      if (Date.now() - lastActivity.current < policy.idleLockSeconds * 1000) return;
      if (policy.mode === 'shared') void endTerminalSession('idle', 'Sessão encerrada por inatividade. Entre de novo.');
      else void lock().then(() => setNotice('Bloqueado por inatividade.'));
    };
    const timer = setInterval(check, 10_000);
    // Em segundo plano o JS para: ao voltar, o tempo fora conta como inatividade.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [status, lock, endTerminalSession]);

  const unlock = useCallback(
    async (id: string) => {
      const account = accounts.find((a) => a.id === id);
      if (account?.terminalId) {
        // Desbloqueio local só no aparelho pessoal (dono do celular): biometria ou o bloqueio de tela dele. Nunca
        // recria sessão expirada: sem tokens válidos o refresh falha e a entrada pede a senha.
        if (account.policy?.mode !== 'personal') return false;
        if (account.biometric) {
          const check = await verifyBiometricKey(id, `Desbloquear ${account.userName}`);
          if (check === 'invalidated') {
            // Digitais/rosto do celular mudaram: a biometria antiga não vale mais. Só a senha libera.
            await dropBiometricKey(id);
            setAccounts(await setAccountBiometric(id, false));
            setNotice('A biometria do celular mudou. Entre com sua senha e ative de novo em Configurações.');
            return false;
          }
          if (check !== 'ok') return false;
        } else if (!(await confirmBiometric(`Desbloquear ${account.userName}`))) return false;
      } else if (account?.biometric && !(await confirmBiometric(`Entrar como ${account.userName}`))) return false;
      return open(id);
    },
    [accounts, open],
  );

  const removeAccount = useCallback(async (id: string) => {
    await dropBiometricKey(id);
    const left = await removeStoredAccount(id);
    setAccounts(left);
    if (left.length === 0 && !terminalRef.current) setStatus('signedOut');
  }, []);

  const setBiometric = useCallback(async (on: boolean) => {
    const id = getActiveAccountId();
    if (!id) return false;
    // Aparelho compartilhado: a biometria do celular não identifica qual funcionário está usando.
    if (on && getActiveAccount()?.policy?.biometric === false) return false;
    if (getActiveAccount()?.terminalId) {
      // Aparelho vinculado: a marca protegida é que confirma (e é invalidada se a biometria do celular mudar).
      if (on && !(await enrollBiometricKey(id))) return false;
      if (!on) await dropBiometricKey(id);
    } else if (on && !((await biometricAvailable()) && (await confirmBiometric('Confirme para ativar o acesso biométrico')))) return false;
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

  /**
   * QR de vínculo. As contas do QR antigo saem do aparelho (emprestavam a sessão de quem gerou o QR): a partir daqui
   * cada um entra com a própria credencial. Se alguma delas ainda tem operação offline pendente, nada muda.
   */
  const bind = useCallback(async (code: string, deviceName: string) => {
    const legacy = (await loadAccounts()).filter((a) => !a.terminalId);
    const pending = await pendingAccounts();
    if (legacy.some((a) => pending.has(a.id)) || pending.has('')) throw new PendingOperationsError();
    const bound = await bindTerminal(code, deviceName);
    await saveTerminal(bound);
    for (const a of legacy) await removeStoredAccount(a.id);
    putTerminal(bound);
    setAccounts(await loadAccounts());
    setNotice(null);
    setStatus('locked');
    return bound;
  }, [putTerminal]);

  const login = useCallback(async (input: LoginInput) => {
    const t = terminalRef.current;
    if (!t) throw new Error('Aparelho não vinculado.');
    let result;
    try {
      result = await terminalLogin(t, input);
    } catch (e) {
      if (isTerminalRevoked(e)) await revokeLocal();
      throw e;
    }
    const { session, user, terminal: info, policy } = result;
    await createAccount(session, {
      id: accountIdFor(info.businessId, user.id), userName: user.name, businessName: info.businessName ?? t.businessName,
      terminalId: t.id, userId: user.id, policy,
    });
    await setActiveBusinessId(info.businessId);
    const list = await loadAccounts();
    setAccounts(list);
    setNotice(null);
    setUpdateRequired(isOutdated(appVersion, session.minAppVersion));
    setStatus('signedIn');
    const id = getActiveAccountId();
    // Pessoal: oferece a digital para desbloquear depois. Compartilhado nunca (a biometria não diz quem é).
    if (policy.biometric && id && !list.find((a) => a.id === id)?.biometric && (await askBiometric(user.name)) && (await enrollBiometricKey(id))) {
      setAccounts(await setAccountBiometric(id, true));
    }
  }, [revokeLocal]);

  const unbind = useCallback(async () => {
    const mine = (await loadAccounts()).filter((a) => a.terminalId);
    const pending = await pendingAccounts();
    if (mine.some((a) => pending.has(a.id))) throw new PendingOperationsError();
    if (status === 'signedIn') await logout();
    for (const a of mine) {
      await dropBiometricKey(a.id);
      await removeStoredAccount(a.id);
    }
    await clearTerminal();
    lockSession();
    await setActiveBusinessId(null);
    putTerminal(null);
    const left = await loadAccounts();
    setAccounts(left);
    setStatus(left.length > 0 ? 'locked' : 'signedOut');
  }, [status, putTerminal]);

  const switchBusiness = useCallback(async (businessId: number) => {
    const switched = await switchBusinessRequest(businessId);
    await replaceAccessToken(switched.accessToken, switched.expiresAt);
    await setActiveBusinessId(switched.businessId);
    setProfile(null);
    setBusinessEpoch((n) => n + 1);
  }, []);

  const activeAccountId = status === 'signedIn' ? getActiveAccountId() : null;
  const policy = status === 'signedIn' ? (getActiveAccount()?.policy ?? null) : null;

  const value = useMemo(
    () => ({
      status, updateRequired, profile, connect, signOut, accounts, activeAccountId, unlock, lock,
      startAdding: () => setStatus('signedOut'), cancelAdding: () => setStatus(terminalRef.current || accounts.length > 0 ? 'locked' : 'signedOut'),
      removeAccount, setBiometric, businessEpoch, switchBusiness, terminal, policy, notice, bind, login, checkTerminal, unbind, touch,
    }),
    [status, updateRequired, profile, connect, signOut, accounts, activeAccountId, unlock, lock, removeAccount, setBiometric, businessEpoch, switchBusiness,
      terminal, policy, notice, bind, login, checkTerminal, unbind, touch],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora de SessionProvider');
  return value;
}
