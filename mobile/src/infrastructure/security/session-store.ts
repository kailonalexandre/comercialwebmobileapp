import { secureStorage } from '@/infrastructure/storage/secure-storage';

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO-8601
};

const KEY = 'cw.session';

// Cópia em memória evita ler o Keychain/Keystore a cada requisição.
let current: Session | null = null;
let persisted = false;

export function isSession(value: unknown): value is Session {
  const v = value as Partial<Session> | null;
  return (
    typeof v?.accessToken === 'string' && typeof v.refreshToken === 'string' && typeof v.expiresAt === 'string'
  );
}

export async function loadSession(): Promise<Session | null> {
  const raw = await secureStorage.get(KEY);
  if (!raw) return (current = null);
  try {
    const parsed: unknown = JSON.parse(raw);
    current = isSession(parsed) ? parsed : null;
    persisted = current !== null;
  } catch {
    current = null;
  }
  if (!current) await secureStorage.remove(KEY);
  return current;
}

// persist=false ("Lembrar de mim" desmarcado): sessão só em memória, some ao fechar o app.
export async function saveSession(session: Session, persist = true): Promise<void> {
  if (persist) await secureStorage.set(KEY, JSON.stringify(session));
  else await secureStorage.remove(KEY);
  current = session;
  persisted = persist;
}

// Troca os tokens após refresh mantendo a escolha original de "Lembrar de mim".
export function replaceSession(session: Session): Promise<void> {
  return saveSession(session, persisted);
}

export function getRefreshToken(): string | null {
  return current?.refreshToken ?? null;
}

export async function clearSession(): Promise<void> {
  current = null;
  persisted = false;
  await secureStorage.remove(KEY);
}

export function getAccessToken(): Promise<string | null> {
  return Promise.resolve(current?.accessToken ?? null);
}
