const parse = (v: string) => (/^\d+(\.\d+){0,2}$/.test(v) ? v.split('.').map(Number) : null);

/** True se `current` é menor que `minimum`. Versão ausente ou ilegível nunca bloqueia (fail-open). */
export function isOutdated(current: string, minimum?: string | null): boolean {
  const cur = parse(current);
  const min = minimum ? parse(minimum) : null;
  if (!cur || !min) return false;
  for (let i = 0; i < 3; i++) {
    const diff = (cur[i] ?? 0) - (min[i] ?? 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}
