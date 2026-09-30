import { router, useLocalSearchParams } from 'expo-router';

import { fetchCustomers } from '@/features/customers/customers-api';
import { fetchProducts } from '@/features/catalog/products-api';
import { usePdvDraft } from '@/features/pdv/pdv-draft';
import { usePreSaleDraft } from '@/features/presale/presale-draft';
import { addItem } from '@/features/presale/draft-model';
import { ListScreen } from '@/features/shell/list-screen';
import { Button } from '@/shared/components/button';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { formatCents } from '@/shared/utils/format';

// Os seletores servem à pré-venda e ao PDV: o parâmetro `mode` diz qual rascunho recebe a escolha.
function useTargetDraft() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const presale = usePreSaleDraft();
  const pdv = usePdvDraft();
  return mode === 'pdv' ? pdv : presale;
}

export function PickProductScreen() {
  const { setDraft } = useTargetDraft();
  return (
    <ListScreen
      title="Adicionar produto"
      scanBarcode
      searchPlaceholder="Nome, código ou barras"
      emptyMessage="Nenhum produto encontrado."
      fetchPage={fetchProducts}
      keyOf={(p) => String(p.id)}
      onBack={() => router.back()}
      renderRow={(p) => (
        <ListRow
          title={p.name}
          lines={[`Cód. ${p.code}${p.sku ? ` · SKU ${p.sku}` : ''}`]}
          trailing={<Text variant="label">{formatCents(p.salePriceCents)}</Text>}
          onPress={() => {
            setDraft((d) => ({ ...d, items: addItem(d.items, { productId: p.id, name: p.name, unitPriceCents: p.salePriceCents }) }));
            router.back();
          }}
        />
      )}
    />
  );
}

export function PickCustomerScreen() {
  const { setDraft } = useTargetDraft();
  const choose = (customer: { id: number; name: string } | null) => {
    setDraft((d) => ({ ...d, customer }));
    router.back();
  };
  return (
    <ListScreen
      title="Cliente"
      searchPlaceholder="Nome, documento ou telefone"
      emptyMessage="Nenhum cliente encontrado."
      fetchPage={fetchCustomers}
      keyOf={(c) => String(c.id)}
      onBack={() => router.back()}
      filters={<Button label="Consumidor final (sem cliente)" variant="outline" onPress={() => choose(null)} />}
      renderRow={(c) => (
        <ListRow
          title={c.name}
          lines={[c.phone, c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : null].filter((v): v is string => !!v)}
          // Cliente bloqueado não é escolhido: o ComercialWeb recusaria a venda de qualquer forma.
          onPress={c.restrictionBlock ? undefined : () => choose({ id: c.id, name: c.name })}
          trailing={c.restrictionBlock ? <StatusPill label="Bloqueado" tone="danger" /> : undefined}
        />
      )}
    />
  );
}
