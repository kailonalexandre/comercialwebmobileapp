import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePagedList, type Paged } from '@/shared/hooks/use-paged-list';

const page = (items: number[], n: number, total: number): Paged<number> => ({ items, page: n, pageSize: 2, total });
const pages = async (n: number) => (n === 1 ? page([1, 2], 1, 5) : n === 2 ? page([3, 4], 2, 5) : page([5], 3, 5));

test('carrega a página 1 e troca de página substituindo os itens', async () => {
  const fetchPage = jest.fn(pages);
  const { result } = await renderHook(() => usePagedList(fetchPage, ''));

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.items).toEqual([1, 2]);
  expect(result.current.totalPages).toBe(3);
  expect(result.current.total).toBe(5);

  await act(async () => result.current.goTo(3));
  await waitFor(() => expect(result.current.items).toEqual([5]));
  expect(result.current.page).toBe(3);
});

test('mudar a busca volta à página 1', async () => {
  const fetchPage = jest.fn(async (n: number, search: string) => (search ? page([9], 1, 1) : pages(n)));
  const { result, rerender } = await renderHook(({ q }: { q: string }) => usePagedList(fetchPage, q), { initialProps: { q: '' } });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await act(async () => result.current.goTo(2));
  await waitFor(() => expect(result.current.page).toBe(2));

  await rerender({ q: 'abc' });
  await waitFor(() => expect(result.current.items).toEqual([9]));
  expect(result.current.page).toBe(1);
  expect(fetchPage).toHaveBeenLastCalledWith(1, 'abc');
});

test('falha na primeira carga vira erro e reload tenta de novo; falha depois mantém os itens', async () => {
  const fetchPage = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(page([1], 1, 1)).mockRejectedValueOnce(new Error('y'));
  const { result } = await renderHook(() => usePagedList(fetchPage, ''));

  await waitFor(() => expect(result.current.status).toBe('error'));
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.status).toBe('ready'));

  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.items).toEqual([1]);
  expect(result.current.status).toBe('ready');
});
