import { router } from 'expo-router';
import { useCallback } from 'react';

import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { fetchProducts } from '@/features/catalog/products-api';
import { PriceTablePicker } from '@/features/pricing/price-table-picker';
import { usePriceTables } from '@/features/pricing/price-tables';
import { formatCents } from '@/shared/utils/format';

export function ProductsScreen() {
  const { selected, select } = usePriceTables();
  // Nova identidade quando a tabela muda: a lista recarrega com os preços dela.
  const fetchPage = useCallback((page: number, search: string) => fetchProducts(page, search, selected), [selected]);
  return (
    <ListScreen
      filters={<PriceTablePicker value={selected} onChange={select} />}
      title="Produtos"
      searchPlaceholder="Nome, código ou barras"
      emptyMessage="Nenhum produto encontrado."
      fetchPage={fetchPage}
      scanBarcode
      keyOf={(p) => String(p.id)}
      onBack={() => router.back()}
      renderRow={(p) => (
        <ListRow
          title={p.name}
          lines={[`Cód. ${p.code}${p.sku ? ` · SKU ${p.sku}` : ''}`]}
          onPress={() => router.push({ pathname: '/produto/[id]', params: { id: String(p.id) } })}
          trailing={
            <>
              {!p.isActive && <StatusPill label="Inativo" tone="danger" />}
              <Text variant="label" color={p.priceCents === null ? 'textMuted' : 'text'}>{p.priceCents === null ? 'Sem preço' : formatCents(p.priceCents)}</Text>
            </>
          }
        />
      )}
    />
  );
}
