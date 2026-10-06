import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { loadQueue, serverIdOf } from '@/features/customers/quick-customer-queue';
import { sendPdvSale } from '@/features/pdv/pdv-api';
import type { Draft } from '@/features/presale/draft-model';
import { sendPreSale, type SendResult } from '@/features/presale/presale-api';
import { getActiveBusinessId } from '@/infrastructure/business-scope';
import { applyResult, belongsTo, restore, type SaleKind, type SaleQueueEntry } from '@/features/sales/sale-queue-model';

// Fila local de vendas e pré-vendas. Toda venda é gravada aqui ANTES de ir ao servidor, então queda de rede,
// fechar o app ou travar no meio do envio nunca perde a venda. Fica no armazenamento privado, em dois arquivos
// (principal + cópia): uma gravação interrompida só estraga um deles.
const FILES = ['sales-queue.json', 'sales-queue.bak.json'] as const;
const KEEP_SYNCED = 20;

let entries: SaleQueueEntry[] = [];
let loaded: Promise<void> | null = null;
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();

function persist() {
  const json = JSON.stringify(entries);
  for (const name of FILES) {
    try {
      const file = new File(Paths.document, name);
      file.create({ overwrite: true });
      file.write(json);
    } catch {
      // Sem disco/permissão a fila segue na memória; o próximo salvamento tenta de novo.
    }
  }
}

function set(next: SaleQueueEntry[]) {
  // Sincronizadas antigas saem; pendentes e com erro ficam até serem resolvidas.
  const synced = next.filter((e) => e.status === 'synced').slice(-KEEP_SYNCED);
  entries = next.filter((e) => e.status !== 'synced' || synced.includes(e));
  persist();
  listeners.forEach((l) => l());
}

const update = (id: string, change: Partial<SaleQueueEntry>) => set(entries.map((e) => (e.id === id ? { ...e, ...change } : e)));

async function readFile(name: string): Promise<SaleQueueEntry[] | null> {
  try {
    const file = new File(Paths.document, name);
    return file.exists ? (JSON.parse(await file.text()) as SaleQueueEntry[]) : null;
  } catch {
    return null;
  }
}

export function loadSaleQueue(): Promise<void> {
  loaded ??= (async () => {
    const stored = (await readFile('sales-queue.json')) ?? (await readFile('sales-queue.bak.json')) ?? [];
    // Entradas criadas durante a leitura (antes de `loaded` resolver) não existem: toda escrita espera este load.
    entries = restore(stored);
    listeners.forEach((l) => l());
  })();
  return loaded;
}

export function useSaleQueue(): SaleQueueEntry[] {
  void loadSaleQueue();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}

export const retrySale = (id: string) => update(id, { status: 'pending', error: undefined, code: undefined });
export const discardSale = (id: string) => set(entries.filter((e) => e.id !== id));

// Cliente cadastrado offline subiu: as vendas que o usavam passam a apontar para o id real e entram na rodada de envio.
export async function resolvePendingCustomer(pendingId: string, customerId: number): Promise<void> {
  await loadSaleQueue();
  if (!entries.some((e) => e.draft.customer?.pendingId === pendingId)) return;
  set(entries.map((e) => (e.draft.customer?.pendingId === pendingId ? { ...e, draft: { ...e.draft, customer: { id: customerId, name: e.draft.customer.name } } } : e)));
  void syncSales();
}

// Cadastro do cliente foi recusado: as vendas dele não têm como subir. Ficam em erro (a venda guardada não se perde).
export async function failPendingCustomer(pendingId: string, message: string): Promise<void> {
  await loadSaleQueue();
  set(entries.map((e) => (e.draft.customer?.pendingId === pendingId && e.status === 'pending' ? { ...e, status: 'error' as const, error: `Cadastro do cliente recusado: ${message}` } : e)));
}

const sendOf = (kind: SaleKind) => (kind === 'pdv' ? sendPdvSale : sendPreSale);

// Envia os pendentes um a um (nada em paralelo). Relê a fila a cada volta: venda gravada durante o envio entra na mesma rodada.
export function syncSales(businessId?: number): Promise<void> {
  running ??= (async () => {
    await loadSaleQueue();
    // Sempre a empresa ativa (a da sessão): a chamada pode vir sem ela enquanto o perfil recarrega depois da troca.
    const active = getActiveBusinessId() ?? businessId;
    const tried = new Set<string>();
    for (;;) {
      const item = entries.find((e) => e.status === 'pending' && !e.draft.customer?.pendingId && !tried.has(e.id) && belongsTo(e, active));
      if (!item) break;
      tried.add(item.id);
      update(item.id, { status: 'syncing' });
      const result = await sendOf(item.kind)(item.draft, item.id);
      update(item.id, applyResult(item, result));
      if (result.kind === 'uncertain') break; // sem conexão para a próxima também: tenta de novo mais tarde
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Grava a venda na fila e tenta enviar na hora. `queued` = continua guardada no aparelho e sobe sozinha quando
 * houver conexão. Recusa e falta de permissão saem da fila (nada foi criado) e voltam ao operador para corrigir.
 */
export async function submitSale(kind: SaleKind, draft: Draft, key: string, sessionBusinessId?: number): Promise<SendResult | { kind: 'queued' }> {
  await Promise.all([loadSaleQueue(), loadQueue()]);
  const businessId = getActiveBusinessId() ?? sessionBusinessId;
  // O cadastro do cliente pode ter subido enquanto a venda era montada: usa o id real na hora.
  const pending = draft.customer?.pendingId;
  const realId = pending ? serverIdOf(pending) : undefined;
  if (pending && realId !== undefined && draft.customer) draft = { ...draft, customer: { id: realId, name: draft.customer.name } };
  // Mesma chave = mesmo pedido: reenviar ou tocar duas vezes nunca cria segunda entrada.
  if (!entries.some((e) => e.id === key)) {
    set([...entries, { id: key, kind, draft, status: 'pending', businessId, createdAt: new Date().toISOString() }]);
  }
  await syncSales(businessId);
  const entry = entries.find((e) => e.id === key);
  if (entry?.status === 'synced' && entry.sale) return { kind: 'ok', sale: entry.sale };
  if (entry?.status === 'error') {
    discardSale(key);
    return entry.code === 'forbidden' ? { kind: 'forbidden' } : { kind: 'rejected', message: entry.error ?? 'Confira os dados e tente de novo.', code: entry.code, totalCents: entry.totalCents };
  }
  return { kind: 'queued' };
}
