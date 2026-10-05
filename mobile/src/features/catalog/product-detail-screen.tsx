import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { fetchProduct, fetchProductStock } from '@/features/catalog/products-api';
import { usePriceTables } from '@/features/pricing/price-tables';
import { DetailFrame } from '@/features/shell/detail-frame';
import { InfoCard } from '@/shared/components/info-card';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { useDetail } from '@/shared/hooks/use-detail';
import { formatCents, formatMilli } from '@/shared/utils/format';

// Preço na tabela escolhida; sem resposta de preços por tabela, só o varejo é conhecido.
function priceIn(p: { prices?: Record<string, number>; salePriceCents: number }, table: string): string {
  if (p.prices) return p.prices[table] === undefined ? 'Sem preço nesta tabela' : formatCents(p.prices[table] as number);
  return table === 'varejo' ? formatCents(p.salePriceCents) : 'Indisponível';
}

export function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fetcher = useCallback(() => fetchProduct(Number(id)), [id]);
  const { data: p, failure, error, reload } = useDetail(fetcher);
  const { tables, selected, label } = usePriceTables();
  // Saldo é secundário: se falhar, a linha some e o resto da tela continua útil.
  const stockFetcher = useCallback(() => fetchProductStock(Number(id)), [id]);
  const { data: stock } = useDetail(stockFetcher);

  return (
    <DetailFrame title="Produto" loading={!p && !failure} failure={failure} error={error} notFoundMessage="Produto não encontrado." onRetry={reload}>
      {p && (
        <>
          <View style={{ gap: 4 }}>
            <Text variant="title">{p.name}</Text>
            {!p.isActive && <StatusPill label="Inativo" tone="danger" />}
          </View>
          <InfoCard
            rows={[
              { label: `Preço (${label(selected)})`, value: priceIn(p, selected) },
              { label: 'Estoque na unidade', value: stock ? formatMilli(stock.totalMilli) : null },
              { label: 'Código', value: String(p.code) },
              { label: 'SKU', value: p.sku },
              { label: 'Código de barras', value: p.barcode },
              { label: 'Descrição', value: p.description },
            ]}
          />
          {p.prices && tables.length > 1 && (
            <InfoCard rows={tables.map((t) => ({ label: `Tabela ${t.label}`, value: p.prices?.[t.key] === undefined ? 'Sem preço' : formatCents(p.prices[t.key] as number) }))} />
          )}
        </>
      )}
    </DetailFrame>
  );
}
