import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { createQuickCustomer } from '@/features/customers/customers-api';
import type { QueueEntry, QuickCustomerInput } from '@/features/customers/quick-customer-model';
import { failPendingCustomer, resolvePendingCustomer } from '@/features/sales/sale-queue';
import { ApiError } from '@/infrastructure/api/client';
import { getActiveBusinessId } from '@/infrastructure/business-scope';

// Fila local de cadastros rápidos. Fica no armazenamento privado do app (arquivo único) e cada item carrega a
// própria Idempotency-Key, então reenviar depois de queda, de toque duplo ou de app fechado nunca duplica o cliente.
const FILE = 'quick-customers.json';
const KEEP_SYNCED = 20;

let entries: QueueEntry[] = [];
let loaded: Promise<void> | null = null;
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();

function persist() {
  try {
    const file = new File(Paths.document, FILE);
    file.create({ overwrite: true });
    file.write(JSON.stringify(entries));
  } catch {
    // Sem disco/permissão a fila segue na memória; o próximo salvamento tenta de novo.
  }
}

function set(next: QueueEntry[]) {
  // Sincronizados antigos saem; pendentes e com erro ficam até serem resolvidos.
  const synced = next.filter((e) => e.status === 'synced').slice(-KEEP_SYNCED);
  entries = next.filter((e) => e.status !== 'synced' || synced.includes(e));
  persist();
  listeners.forEach((l) => l());
}

// Cadastro de uma empresa nunca sobe nem aparece em outra. Sem empresa conhecida (dado antigo), vale para qualquer uma.
export const inActiveBusiness = (e: QueueEntry) => e.businessId === undefined || getActiveBusinessId() === null || e.businessId === getActiveBusinessId();

const update = (id: string, change: Partial<QueueEntry>) => set(entries.map((e) => (e.id === id ? { ...e, ...change } : e)));

export function loadQueue(): Promise<void> {
  loaded ??= (async () => {
    try {
      const file = new File(Paths.document, FILE);
      if (file.exists) {
        const parsed = JSON.parse(await file.text()) as QueueEntry[];
        // App fechado no meio do envio: volta para a fila (o reenvio é seguro por causa da chave).
        entries = parsed.map((e) => (e.status === 'syncing' ? { ...e, status: 'pending' as const } : e));
      }
    } catch {
      entries = [];
    }
    listeners.forEach((l) => l());
  })();
  return loaded;
}

export function useQuickCustomerQueue(): QueueEntry[] {
  void loadQueue();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}

export async function enqueueQuickCustomer(input: QuickCustomerInput): Promise<QueueEntry> {
  await loadQueue();
  const entry: QueueEntry = { id: randomUUID(), input, status: 'pending', businessId: getActiveBusinessId() ?? undefined, createdAt: new Date().toISOString() };
  set([...entries, entry]);
  return entry;
}

export const clearQueue = () => entries.length > 0 && set([]);
// Id do servidor de um cadastro já sincronizado (undefined = ainda na fila ou recusado).
export const serverIdOf = (id: string) => entries.find((e) => e.id === id)?.serverId;

export const discardEntry = (id: string) => set(entries.filter((e) => e.id !== id));
export const retryEntry = (id: string) => update(id, { status: 'pending', error: undefined });

function failureMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = e.refusal?.fields;
    if (fields) return Object.values(fields)[0] ?? 'Dados recusados.';
    if (e.kind === 'forbidden') return 'Você não tem permissão para cadastrar clientes.';
    if (e.kind === 'validation') return e.refusal?.message ?? 'Os dados foram recusados. Corrija e tente de novo.';
  }
  return 'Não foi possível enviar. Tente de novo.';
}

// Envia os pendentes um a um. Chamada simultânea reaproveita a execução em curso (nada é enviado em paralelo).
export function syncQuickCustomers(): Promise<void> {
  running ??= (async () => {
    await loadQueue();
    for (const item of entries.filter((e) => e.status === 'pending' && inActiveBusiness(e))) {
      update(item.id, { status: 'syncing' });
      try {
        const created = await createQuickCustomer(item.input, item.id);
        update(item.id, { status: 'synced', serverId: created.id, incomplete: created.incomplete, error: undefined });
        void resolvePendingCustomer(item.id, created.id);
      } catch (e) {
        const offline = e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout' || e.kind === 'server');
        if (offline) {
          update(item.id, { status: 'pending' });
          break; // sem conexão para o próximo também: tenta de novo mais tarde
        }
        update(item.id, { status: 'error', error: failureMessage(e) });
        void failPendingCustomer(item.id, failureMessage(e));
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
