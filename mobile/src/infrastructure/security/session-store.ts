import { randomUUID } from 'expo-crypto';

import { secureStorage } from '@/infrastructure/storage/secure-storage';

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO-8601
  // api.min_app_version do ComercialWeb, repassada pela API no pareamento e em cada refresh.
  minAppVersion?: string | null;
};

// Cada QR pareado vira uma conta guardada no aparelho (vendedor, caixa...). O índice só tem o que a tela de escolha
// mostra; os tokens de cada conta ficam num item próprio do Keychain/Keystore (que tem limite de tamanho por item).
export type Account = { id: string; userName: string; businessName: string; biometric: boolean };

const INDEX = 'cw.accounts';
const LEGACY = 'cw.session'; // versão com uma conta só
const sessionKey = (id: string) => `cw.session.${id}`;

// Cópia em memória evita ler o Keychain/Keystore a cada requisição. `activeId` = conta aberta (null = bloqueado).
let current: Session | null = null;
let activeId: string | null = null;

export const getActiveAccountId = () => activeId;

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
      return parsed;
    }
  } catch {
    // cai no descarte abaixo
  }
  await removeAccount(id);
  return null;
}

/** Conta nova a partir do pareamento; fica aberta. Nome e empresa chegam depois, com o perfil (`describeAccount`). */
export async function createAccount(session: Session): Promise<string> {
  const id = randomUUID();
  await secureStorage.set(sessionKey(id), JSON.stringify(session));
  await writeIndex([...(await readIndex()), { id, userName: '', businessName: '', biometric: false }]);
  current = session;
  activeId = id;
  return id;
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
