import { router } from 'expo-router';

import { ListScreen } from '@/features/shell/list-screen';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import type { Paged } from '@/shared/hooks/use-paged-list';
import { api } from '@/infrastructure/api';
import { formatCents } from '@/shared/utils/format';

type Product = { id: number; code: number; name: string; sku: string | null; barcode: string | null; salePriceCents: number; isActive: boolean };

async function fetchProducts(page: number, search: string): Promise<Paged<Product>> {
  if (!api) {
    if (!__DEV__) throw new Error('API não configurada.');
    return { items: [{ id: 1, code: 1, name: 'Camiseta básica', sku: 'CAM-01', barcode: null, salePriceCents: 4_990, isActive: true }], page: 1, pageSize: 20, total: 1 };
  }
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) query.set('search', search);
  return api.request<Paged<Product>>(`/v1/products?${query.toString()}`);
}

export function ProductsScreen() {
  return (
    <ListScreen
      title="Produtos"
      searchPlaceholder="Nome, código, SKU ou código de barras"
      emptyMessage="Nenhum produto encontrado."
      fetchPage={fetchProducts}
      keyOf={(p) => String(p.id)}
      onBack={() => router.back()}
      renderRow={(p) => (
        <ListRow
          title={p.name}
          lines={[`Cód. ${p.code}${p.sku ? ` · SKU ${p.sku}` : ''}`]}
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
