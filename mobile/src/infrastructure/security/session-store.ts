import { randomUUID } from 'expo-crypto';

import { secureStorage } from '@/infrastructure/storage/secure-storage';

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO-8601
  // api.min_app_version do ComercialWeb, repassada pela API no pareamento e em cada refresh.
  minAppVersion?: string | null;
};

// Regras da sessão aberta num aparelho vinculado, vindas do servidor no login (o app não decide sozinho).
export type SessionPolicy = { mode: 'personal' | 'shared'; idleLockSeconds: number; offlineHours: number; biometric: boolean };

// Cada login vira uma conta guardada no aparelho (vendedor, caixa...). O índice só tem o que a tela de escolha
// mostra; os tokens de cada conta ficam num item próprio do Keychain/Keystore (que tem limite de tamanho por item).
// Conta de aparelho vinculado tem id fixo por empresa+funcionário: quem volta (mesmo depois de revincular o aparelho)
// reencontra a própria fila offline, e a fila de um nunca sobe na sessão de outro.
export type Account = {
  id: string; userName: string; businessName: string; biometric: boolean;
  terminalId?: string; userId?: number; policy?: SessionPolicy; lastOnlineAt?: string;
};

export const accountIdFor = (businessId: number, userId: number) => `b${businessId}-u${userId}`;

const INDEX = 'cw.accounts';
const LEGACY = 'cw.session'; // versão com uma conta só
const sessionKey = (id: string) => `cw.session.${id}`;

// Cópia em memória evita ler o Keychain/Keystore a cada requisição. `activeId` = conta aberta (null = bloqueado).
let current: Session | null = null;
let activeId: string | null = null;
let activeMeta: Account | null = null;

export const getActiveAccountId = () => activeId;
export const getActiveAccount = () => activeMeta;

export function isSession(value: unknown): value is Session {
  const v = value as Partial<Session> | null;
  return (
    typeof v?.accessToken === 'string' && typeof v.refreshToken === 'string' && typeof v.expiresAt === 'string'
  );
}

async function readIndex(): Promise<Account[]> {
  try {
    const parsed: unknown = JSON.parse((await secureStorage.get(INDEX)) ?? '[]');
    return Array.isArray(parsed) ? (parsed as Account[]).filter((a) => typeof a?.id === 'string') : [];
  } catch {
    return [];
  }
}

const writeIndex = (accounts: Account[]) => secureStorage.set(INDEX, JSON.stringify(accounts));

/** Contas do aparelho. A sessão única de versões anteriores vira a primeira conta (sem pedir novo QR). */
export async function loadAccounts(): Promise<Account[]> {
  const accounts = await readIndex();
  const legacy = await secureStorage.get(LEGACY);
  if (legacy) {
    const id = randomUUID();
    await secureStorage.set(sessionKey(id), legacy);
    await secureStorage.remove(LEGACY);
    accounts.push({ id, userName: 'Conta', businessName: '', biometric: false });
    await writeIndex(accounts);
  }
  return accounts;
}

/** Abre a conta: os tokens dela passam a valer nas requisições. Sessão ilegível: a conta é descartada. */
export async function openAccount(id: string): Promise<Session | null> {
  const raw = await secureStorage.get(sessionKey(id));
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isSession(parsed)) {
      current = parsed;
      activeId = id;
      activeMeta = (await readIndex()).find((a) => a.id === id) ?? null;
      return parsed;
    }
  } catch {
    // cai no descarte abaixo
  }
  await removeAccount(id);
  return null;
}

/**
 * Conta nova a partir do pareamento/login; fica aberta. Nome e empresa chegam depois, com o perfil (`describeAccount`).
 * Com `meta.id` (login no aparelho vinculado) a conta do mesmo funcionário é reaproveitada: tokens novos, mesma biometria.
 */
export async function createAccount(session: Session, meta: Partial<Omit<Account, 'biometric'>> = {}): Promise<string> {
  const id = meta.id ?? randomUUID();
  const index = await readIndex();
  const previous = index.find((a) => a.id === id);
  const account: Account = { userName: '', businessName: '', ...previous, ...meta, id, biometric: previous?.biometric ?? false, lastOnlineAt: new Date().toISOString() };
  await secureStorage.set(sessionKey(id), JSON.stringify(session));
  await writeIndex([...index.filter((a) => a.id !== id), account]);
  current = session;
  activeId = id;
  activeMeta = account;
  return id;
}

const ONLINE_PERSIST_MS = 5 * 60_000;

/** O servidor respondeu: renova a janela offline. Grava no Keychain no máximo a cada 5 min. */
export async function markOnline(now = Date.now()): Promise<void> {
  if (!activeMeta) return;
  const last = activeMeta.lastOnlineAt ? Date.parse(activeMeta.lastOnlineAt) : 0;
  activeMeta = { ...activeMeta, lastOnlineAt: new Date(now).toISOString() };
  if (now - last < ONLINE_PERSIST_MS) return;
  const meta = activeMeta;
  await writeIndex((await readIndex()).map((a) => (a.id === meta.id ? meta : a)));
}

/**
 * Pode gravar operação para sincronizar depois? Só dentro da janela offline do aparelho (`policy.offlineHours`) desde a
 * última resposta do servidor. Conta antiga (QR antigo, sem política) segue como antes.
 */
export function offlineAllowed(account: Account | null = activeMeta, now = Date.now()): boolean {
  if (!account?.policy) return true;
  const last = account.lastOnlineAt ? Date.parse(account.lastOnlineAt) : 0;
  return now - last <= account.policy.offlineHours * 3_600_000;
}

/**
 * Preenche nome/empresa da conta aberta. Se o mesmo usuário da mesma empresa já estava no aparelho (leu outro QR), a
 * conta antiga sai e herda a escolha de biometria. ponytail: a sessão antiga some do aparelho mas só expira no servidor.
 */
export async function describeAccount(userName: string, businessName: string): Promise<Account[]> {
  const accounts = await readIndex();
  const mine = accounts.find((a) => a.id === activeId);
  if (!mine) return accounts;
  const twin = accounts.find((a) => a.id !== mine.id && a.userName === userName && a.businessName === businessName);
  const next = accounts.filter((a) => a.id !== twin?.id).map((a) => (a.id === mine.id ? { ...a, userName, businessName, biometric: twin?.biometric ?? a.biometric } : a));
  if (twin) await secureStorage.remove(sessionKey(twin.id));
  await writeIndex(next);
  return next;
}

export async function setAccountBiometric(id: string, biometric: boolean): Promise<Account[]> {
  const next = (await readIndex()).map((a) => (a.id === id ? { ...a, biometric } : a));
  await writeIndex(next);
  return next;
}

export async function removeAccount(id: string): Promise<Account[]> {
  await secureStorage.remove(sessionKey(id));
  const next = (await readIndex()).filter((a) => a.id !== id);
  await writeIndex(next);
  if (activeId === id) lockSession();
  return next;
}

/** Fecha a conta aberta sem apagá-la: o aparelho volta à escolha de conta. */
export function lockSession(): void {
  current = null;
  activeId = null;
  activeMeta = null;
}

/**
 * Aparelho compartilhado: ao trocar de operador os tokens somem do aparelho (a próxima pessoa entra com o PIN dela).
 * A conta fica no índice só como nome, para a fila offline dela continuar reconhecível; nada de sessão sobra.
 */
export async function forgetTokens(id: string): Promise<void> {
  await secureStorage.remove(sessionKey(id));
  if (activeId === id) lockSession();
}

// Salva na conta aberta; sem conta aberta (bloqueado no meio de uma requisição) não grava em lugar nenhum.
export async function replaceSession(session: Session): Promise<void> {
  if (!activeId) return;
  await secureStorage.set(sessionKey(activeId), JSON.stringify(session));
  current = session;
}

// Troca de empresa: só o access token muda (a API emite um novo para a empresa escolhida); o refresh da sessão continua valendo.
export async function replaceAccessToken(accessToken: string, expiresAt: string): Promise<void> {
  if (current) await replaceSession({ ...current, accessToken, expiresAt });
}

export function getRefreshToken(): string | null {
  return current?.refreshToken ?? null;
}

/** Sair/desconectar: remove a conta aberta do aparelho. Devolve as contas que restam. */
export async function clearSession(): Promise<Account[]> {
  return activeId ? removeAccount(activeId) : readIndex();
}

export function getAccessToken(): Promise<string | null> {
  return Promise.resolve(current?.accessToken ?? null);
}
