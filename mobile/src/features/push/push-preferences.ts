import { api } from '@/infrastructure/api';

const PATH = '/v1/me/push-preferences';

// Domínios que o ComercialWeb gera hoje. Domínio fora desta lista nunca é silenciado pelo app.
export const PUSH_DOMAINS: { key: string; label: string; hint: string }[] = [
  { key: 'venda', label: 'Vendas', hint: 'Venda finalizada, liberações' },
  { key: 'loja_virtual', label: 'Loja virtual', hint: 'Vendas feitas na loja online' },
  { key: 'estoque', label: 'Estoque', hint: 'Estoque mínimo, transferências' },
  { key: 'produtos', label: 'Produtos', hint: 'Mudanças no catálogo' },
  { key: 'pessoas', label: 'Clientes e pessoas', hint: 'Cadastros e alterações' },
  { key: 'sistema', label: 'Avisos do sistema', hint: 'Novidades e mensagens gerais' },
];

// Lista de silenciados com `key` ligado (receber) ou desligado (silenciar), sem duplicar.
export function setReceiving(muted: string[], key: string, receive: boolean): string[] {
  const rest = muted.filter((d) => d !== key);
  return receive ? rest : [...rest, key];
}

export async function fetchMutedDomains(): Promise<string[]> {
  if (!api) return [];
  const res = await api.request<{ mutedDomains: string[] }>(PATH);
  return res.mutedDomains;
}

export const saveMutedDomains = (mutedDomains: string[]) => api?.request(PATH, { method: 'PUT', body: { mutedDomains } });
