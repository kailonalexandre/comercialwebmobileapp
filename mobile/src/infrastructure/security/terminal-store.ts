import { randomUUID } from 'expo-crypto';

import { secureStorage } from '@/infrastructure/storage/secure-storage';

// Aparelho vinculado à empresa pelo QR de vínculo. O segredo só serve para pedir login (não abre dados sozinho) e
// fica no Keychain/Keystore, como os tokens. Um aparelho tem um vínculo por vez.
export type Terminal = { id: string; secret: string; name: string; mode: 'personal' | 'shared'; businessName: string };

const TERMINAL = 'cw.terminal';
const INSTALLATION = 'cw.installation';

export function isTerminal(value: unknown): value is Terminal {
  const v = value as Partial<Terminal> | null;
  return typeof v?.id === 'string' && typeof v.secret === 'string' && (v.mode === 'personal' || v.mode === 'shared');
}

export async function loadTerminal(): Promise<Terminal | null> {
  try {
    const parsed: unknown = JSON.parse((await secureStorage.get(TERMINAL)) ?? 'null');
    return isTerminal(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const saveTerminal = (terminal: Terminal) => secureStorage.set(TERMINAL, JSON.stringify(terminal));

export const clearTerminal = () => secureStorage.remove(TERMINAL);

/**
 * Identificador desta instalação, gerado uma vez e guardado no Keychain/Keystore. O servidor mantém um vínculo ativo por
 * instalação: vincular de novo (outro QR, outra empresa) derruba o anterior. Reinstalar o app gera outro.
 */
export async function installationId(): Promise<string> {
  const saved = await secureStorage.get(INSTALLATION);
  if (saved) return saved;
  const id = randomUUID();
  await secureStorage.set(INSTALLATION, id);
  return id;
}
