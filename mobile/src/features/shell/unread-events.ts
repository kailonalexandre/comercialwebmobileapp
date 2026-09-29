// Avisa quem mostra o contador do sino (cabeçalhos) que ele mudou: marcar lida/arquivar em outra tela.
const listeners = new Set<() => void>();

export function onUnreadChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitUnreadChanged(): void {
  listeners.forEach((listener) => listener());
}
