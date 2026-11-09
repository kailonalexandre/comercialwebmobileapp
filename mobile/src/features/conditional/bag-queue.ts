import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { sendMove } from '@/features/conditional/bag-api';
import type { BagMove, BagMoveKind } from '@/features/conditional/bag-model';
import { getActiveBusinessId } from '@/infrastructure/business-scope';
import { Alert } from 'react-native';

import { OFFLINE_EXPIRED } from '@/features/sales/sale-queue';
import { rememberCreatedAt } from '@/infrastructure/api/client';
import { getActiveAccountId, offlineAllowed } from '@/infrastructure/security/session-store';

// Fila local de baixas da sacola. A baixa é gravada aqui ANTES de ir ao servidor, então sem internet (ou com o app
// fechado no meio do envio) o vendedor continua vendendo e nada se perde. Em dois arquivos (principal + cópia),
// como a fila de vendas. Cada baixa leva a própria chave: o reenvio nunca baixa duas vezes no ComercialWeb.
const FILES = ['bag-queue.json', 'bag-queue.bak.json'] as const;

let moves: BagMove[] = [];
let loaded: Promise<void> | null = null;
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: BagMove[]) {
  moves = next;
  const json = JSON.stringify(moves);
  for (const name of FILES) {
    try {
      const file = new File(Paths.document, name);
      file.create({ overwrite: true });
      file.write(json);
    } catch {
      // Sem disco/permissão a fila segue na memória; a próxima gravação tenta de novo.
    }
  }
  listeners.forEach((l) => l());
}

async function readFile(name: string): Promise<BagMove[] | null> {
  try {
    const file = new File(Paths.document, name);
    return file.exists ? (JSON.parse(await file.text()) as BagMove[]) : null;
  } catch {
    return null;
  }
}

export function loadBagQueue(): Promise<void> {
  loaded ??= (async () => {
    const stored = (await readFile(FILES[0])) ?? (await readFile(FILES[1])) ?? [];
    // Fechou o app no meio do envio: volta para a fila (o reenvio é seguro pela chave).
    moves = stored.map((m) => (m.status === 'syncing' ? { ...m, status: 'pending' as const } : m));
    listeners.forEach((l) => l());
  })();
  return loaded;
}

export function useBagQueue(): BagMove[] {
  void loadBagQueue();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => moves,
  );
}

const update = (id: string, change: Partial<BagMove>) => set(moves.map((m) => (m.id === id ? { ...m, ...change } : m)));

export async function pendingBagAccounts(): Promise<string[]> {
  await loadBagQueue();
  return moves.map((m) => m.accountId ?? '');
}

export const retryMove = (id: string) => update(id, { status: 'pending', error: undefined });
export const discardMove = (id: string) => set(moves.filter((m) => m.id !== id));

/** Anota a baixa e tenta enviar na hora. Volta sem esperar o envio terminar quando não há conexão. */
export async function queueMove(conditionalId: number, itemId: number, kind: BagMoveKind, quantity: number): Promise<void> {
  await loadBagQueue();
  if (!offlineAllowed()) return Alert.alert('Sem conexão', OFFLINE_EXPIRED);
  const businessId = getActiveBusinessId() ?? undefined;
  set([...moves, { id: randomUUID(), conditionalId, itemId, kind, quantity, status: 'pending', businessId, accountId: getActiveAccountId() ?? undefined, createdAt: new Date().toISOString() }]);
  await syncBagMoves();
}

// Envia na ordem em que foram feitas, uma a uma. Sem conexão para (as próximas também não passariam). Baixa aceita
// sai da fila (o servidor já tem); recusada fica em erro para o vendedor decidir.
export function syncBagMoves(): Promise<void> {
  running ??= (async () => {
    await loadBagQueue();
    const active = getActiveBusinessId();
    for (;;) {
      const next = moves.find((m) => m.status === 'pending' && (m.businessId === undefined || active == null || m.businessId === active) && (m.accountId === undefined || getActiveAccountId() === null || m.accountId === getActiveAccountId()));
      if (!next) break;
      update(next.id, { status: 'syncing' });
      rememberCreatedAt(next.id, next.createdAt);
      const result = await sendMove(next.conditionalId, next.itemId, next.kind, next.quantity, next.id);
      if (result.kind === 'ok') discardMove(next.id);
      else if (result.kind === 'uncertain') {
        update(next.id, { status: 'pending' });
        break;
      } else update(next.id, { status: 'error', error: result.kind === 'forbidden' ? 'Você não tem permissão para esta operação.' : result.message });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
