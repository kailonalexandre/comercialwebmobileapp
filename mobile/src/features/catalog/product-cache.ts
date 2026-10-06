import { File, Paths } from 'expo-file-system';

import { searchProducts } from '@/features/catalog/product-cache-model';
import { fetchProductsRemote, type Product } from '@/features/catalog/products-api';

// Cópia local dos produtos, uma por tabela de preço (o preço do app é o da tabela da operação). Baixada com o app
// aberto e online (GET /products, 50 por página) e apagada ao sair da conta. Sem conexão, a busca do seletor usa a cópia.
const MAX_PAGES = 100; // ponytail: 5.000 produtos por tabela; acima disso a busca offline vê só os primeiros. Upgrade: GET /sync incremental no .NET.
const REFRESH_MS = 6 * 60 * 60 * 1000;

type Stored = { savedAt: number; items: Product[] };

const memory = new Map<string, Stored>();
let refreshing: Promise<void> | null = null;

const fileOf = (table: string) => new File(Paths.document, `products-cache-${table.replace(/[^a-z0-9_-]/gi, '_')}.json`);

async function read(table: string): Promise<Stored | null> {
  const cached = memory.get(table);
  if (cached) return cached;
  try {
    if (fileOf(table).exists) {
      const stored = JSON.parse(await fileOf(table).text()) as Stored;
      memory.set(table, stored);
      return stored;
    }
  } catch {
    // arquivo ilegível: tratado como sem cópia
  }
  return null;
}

export async function searchProductsOffline(table: string, search: string, page: number, pageSize: number) {
  const stored = await read(table);
  return stored ? searchProducts(stored.items, search, page, pageSize) : null;
}

async function refreshTable(table: string, force: boolean) {
  const stored = await read(table);
  if (!force && stored && Date.now() - stored.savedAt < REFRESH_MS) return;
  const items: Product[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetchProductsRemote(page, '', table, 50);
    items.push(...r.items);
    if (items.length >= r.total || r.items.length === 0) break;
  }
  const next = { savedAt: Date.now(), items };
  memory.set(table, next);
  fileOf(table).create({ overwrite: true });
  fileOf(table).write(JSON.stringify(next));
}

export function refreshProductCache(tables: string[], force = false): Promise<void> {
  refreshing ??= (async () => {
    for (const table of tables) {
      try {
        await refreshTable(table, force);
      } catch {
        return; // sem conexão ou sem permissão: segue com a cópia anterior e tenta no próximo ciclo
      }
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function clearProductCache(tables: string[]) {
  memory.clear();
  for (const table of tables) {
    try {
      if (fileOf(table).exists) fileOf(table).delete();
    } catch {
      // nada a fazer
    }
  }
}

// Preços da cópia local numa tabela (null = produto sem preço ou fora da cópia). Sem cópia da tabela: null no todo.
export async function pricesOffline(table: string, productIds: number[]): Promise<Record<string, number | null> | null> {
  const stored = await read(table);
  if (!stored) return null;
  const byId = new Map(stored.items.map((p) => [p.id, p.priceCents]));
  return Object.fromEntries(productIds.map((id) => [String(id), byId.get(id) ?? null]));
}
