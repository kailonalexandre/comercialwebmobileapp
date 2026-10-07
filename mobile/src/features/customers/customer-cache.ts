import { searchCached } from '@/features/customers/customer-cache-model';
import { fetchCustomersRemote, type Customer } from '@/features/customers/customers-api';
import { deleteScopedFiles, getActiveBusinessId, scopedFile } from '@/infrastructure/business-scope';

// Cópia local dos clientes ativos para escolher cliente sem conexão. Baixada com o app aberto e online
// (GET /customers, 50 por página) e apagada ao sair da conta: dado de cliente não passa de um usuário a outro.
const FILE = 'customers-cache';
const MAX_PAGES = 100; // ponytail: 5.000 clientes; acima disso a busca offline vê só os primeiros. Upgrade: GET /sync (incremental) no .NET.
const REFRESH_MS = 6 * 60 * 60 * 1000;

type Stored = { savedAt: number; items: Customer[] };

// Uma cópia por empresa (arquivo e memória): trocar de empresa nunca lê a cópia da outra.
let memory: { businessId: number; stored: Stored } | null = null;
let refreshing: Promise<void> | null = null;

async function read(): Promise<Stored | null> {
  const businessId = getActiveBusinessId();
  const file = scopedFile(FILE);
  if (businessId === null || !file) return null;
  if (memory?.businessId === businessId) return memory.stored;
  memory = null;
  try {
    if (file.exists) memory = { businessId, stored: JSON.parse(await file.text()) as Stored };
  } catch {
    memory = null;
  }
  return memory?.stored ?? null;
}

export async function searchOffline(search: string, page: number, pageSize: number) {
  const stored = await read();
  return stored ? searchCached(stored.items, search, page, pageSize) : null;
}

export function refreshCustomerCache(force = false): Promise<void> {
  refreshing ??= (async () => {
    const stored = await read();
    if (!force && stored && Date.now() - stored.savedAt < REFRESH_MS) return;
    const businessId = getActiveBusinessId();
    const file = scopedFile(FILE);
    if (businessId === null || !file) return;
    try {
      const items: Customer[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await fetchCustomersRemote(page, '', 50);
        items.push(...r.items);
        if (items.length >= r.total || r.items.length === 0) break;
      }
      // Trocou de empresa durante o download: o que veio é da anterior e não pode ser gravado como da nova.
      if (getActiveBusinessId() !== businessId) return;
      const stored = { savedAt: Date.now(), items };
      memory = { businessId, stored };
      file.create({ overwrite: true });
      file.write(JSON.stringify(stored));
    } catch {
      // Sem conexão ou sem permissão: segue com a cópia anterior (se houver) e tenta no próximo ciclo.
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function clearCustomerCache() {
  memory = null;
  deleteScopedFiles(FILE);
}
