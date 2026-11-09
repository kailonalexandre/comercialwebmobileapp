import type { Customer } from '@/features/customers/customers-api';
import type { Paged } from '@/shared/hooks/use-paged-list';

const plain = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digitsOf = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

// Mesma busca da tela, feita no aparelho: nome/fantasia sem acento, ou documento/telefone só por dígitos.
export function searchCached(all: Customer[], search: string, page: number, pageSize: number): Paged<Customer> {
  const text = plain(search.trim());
  const nums = digitsOf(search);
  const hits = text === '' ? all : all.filter((c) => plain(c.name).includes(text) || plain(c.tradeName).includes(text) || (nums !== '' && (digitsOf(c.document).includes(nums) || digitsOf(c.phone).includes(nums))));
  return { items: hits.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: hits.length };
}
