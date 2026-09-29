import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePagedList, type Paged } from '@/shared/hooks/use-paged-list';

const page = (items: number[], n: number, total: number): Paged<number> => ({ items, page: n, pageSize: 2, total });

test('carrega a primeira página e acrescenta as seguintes até o total', async () => {
  const fetchPage = jest.fn(async (n: number) => (n === 1 ? page([1, 2], 1, 3) : page([3], 2, 3)));
  const { result } = await renderHook(() => usePagedList(fetchPage, ''));

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.items).toEqual([1, 2]);

  await act(async () => result.current.loadMore());
  await waitFor(() => expect(result.current.items).toEqual([1, 2, 3]));

  await act(async () => result.current.loadMore()); // já tem tudo: não chama de novo
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

test('falha na primeira página vira erro e reload tenta de novo', async () => {
  const fetchPage = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(page([1], 1, 1));
  const { result } = await renderHook(() => usePagedList(fetchPage, ''));

  await waitFor(() => expect(result.current.status).toBe('error'));
  await act(async () => result.current.reload());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.items).toEqual([1]);
});
