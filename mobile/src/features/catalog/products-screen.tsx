import { router } from 'expo-router';

import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { fetchProducts } from '@/features/catalog/products-api';
import { formatCents } from '@/shared/utils/format';

export function ProductsScreen() {
  return (
    <ListScreen
      title="Produtos"
      searchPlaceholder="Nome, código, SKU ou código de barras"
      emptyMessage="Nenhum produto encontrado."
      fetchPage={fetchProducts}
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
              <Text variant="label">{formatCents(p.salePriceCents)}</Text>
            </>
          }
        />
      )}
    />
  );
}
