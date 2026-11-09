import { Directory, File, Paths } from 'expo-file-system';

import { secureStorage } from '@/infrastructure/storage/secure-storage';

// Empresa ativa do aparelho (a mesma da sessão na API). Fica guardada para o app abrir offline já na empresa certa e
// serve de chave para tudo que é guardado no aparelho: cópias de clientes/produtos/formas de pagamento e as filas.
// Dado de uma empresa nunca é lido na outra.
const KEY = 'cw.business';

let active: number | null = null;

export const getActiveBusinessId = () => active;

// Cópias de versões anteriores (sem empresa no nome) não podem ser lidas por empresa nenhuma: somem.
function deleteLegacyFiles() {
  try {
    for (const entry of new Directory(Paths.document).list()) {
      if (entry instanceof File && (entry.name === 'customers-cache.json' || entry.name === 'payment-methods.json' || /^products-cache-(?!b\d)/.test(entry.name))) entry.delete();
    }
  } catch {
    // nada a fazer
  }
}

export async function loadActiveBusinessId(): Promise<void> {
  deleteLegacyFiles();
  try {
    const raw = await secureStorage.get(KEY);
    active = raw && Number.isInteger(Number(raw)) ? Number(raw) : null;
  } catch {
    active = null;
  }
}

export async function setActiveBusinessId(id: number | null): Promise<void> {
  active = id;
  try {
    if (id === null) await secureStorage.remove(KEY);
    else await secureStorage.set(KEY, String(id));
  } catch {
    // sem Keychain/Keystore a empresa fica só em memória; o perfil a define de novo ao abrir
  }
}

/** Nome do arquivo da empresa ativa (`customers-cache` -> `customers-cache-b10.json`); null sem empresa conhecida. */
export function scopedFileName(base: string): string | null {
  return active === null ? null : `${base}-b${active}.json`;
}

export function scopedFile(base: string): File | null {
  const name = scopedFileName(base);
  return name ? new File(Paths.document, name) : null;
}

/** Apaga as cópias com o prefixo, de todas as empresas (saída da conta: dado de cliente não passa de um usuário a outro). */
export function deleteScopedFiles(prefix: string): void {
  try {
    for (const entry of new Directory(Paths.document).list()) {
      if (entry instanceof File && entry.name.startsWith(`${prefix}-b`)) entry.delete();
    }
  } catch {
    // nada a fazer
  }
}
