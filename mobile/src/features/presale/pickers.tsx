import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { inActiveBusiness, useQuickCustomerQueue } from '@/features/customers/quick-customer-queue';
import { fetchCustomers } from '@/features/customers/customers-api';
import { fetchProducts } from '@/features/catalog/products-api';
import { suggestedTable } from '@/features/pricing/price-table-model';
import { usePriceTables } from '@/features/pricing/price-tables';
import { useConditionalDraft } from '@/features/conditional/conditional-draft';
import { usePdvDraft } from '@/features/pdv/pdv-draft';
import { usePreSaleDraft } from '@/features/presale/presale-draft';
import { addItem } from '@/features/presale/draft-model';
import { ListScreen } from '@/features/shell/list-screen';
import { Button } from '@/shared/components/button';
import { ListRow } from '@/shared/components/list-row';
import { StatusPill } from '@/shared/components/status-pill';
import { Text } from '@/shared/components/text';
import { formatCents } from '@/shared/utils/format';

// Os seletores servem à pré-venda, ao PDV e ao condicional: o parâmetro `mode` diz qual rascunho recebe a escolha.
function useTargetDraft() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const presale = usePreSaleDraft();
  const pdv = usePdvDraft();
  const conditional = useConditionalDraft();
  return mode === 'pdv' ? pdv : mode === 'conditional' ? conditional : presale;
}

export function PickProductScreen() {
  const { draft, setDraft } = useTargetDraft();
  const { label } = usePriceTables();
  // Preços da tabela da operação, já na busca.
  const fetchPage = useCallback((page: number, search: string) => fetchProducts(page, search, draft.priceTable), [draft.priceTable]);
  return (
    <ListScreen
      title="Adicionar produto"
      subtitle={`Tabela de preço: ${label(draft.priceTable)}`}
      scanBarcode
      searchPlaceholder="Nome, código ou barras"
      emptyMessage="Nenhum produto encontrado."
      fetchPage={fetchPage}
      keyOf={(p) => String(p.id)}
      onBack={() => router.back()}
      renderRow={(p) => (
        <ListRow
          title={p.name}
          lines={[`Cód. ${p.code}${p.sku ? ` · SKU ${p.sku}` : ''}`]}
          trailing={<Text variant="label" color={p.priceCents === null ? 'textMuted' : 'text'}>{p.priceCents === null ? 'Sem preço' : formatCents(p.priceCents)}</Text>}
          // Produto sem preço na tabela da operação não entra: o ComercialWeb não teria o que cobrar.
          onPress={p.priceCents === null ? undefined : () => {
            const unitPriceCents = p.priceCents as number;
            setDraft((d) => ({ ...d, items: addItem(d.items, { productId: p.id, name: p.name, unitPriceCents }) }));
            router.back();
          }}
        />
      )}
    />
  );
}

export function PickCustomerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { setDraft } = useTargetDraft();
  const { tables } = usePriceTables();
  const waiting = useQuickCustomerQueue().filter((e) => (e.status === 'pending' || e.status === 'syncing') && inActiveBusiness(e));
  const choose = (customer: { id: number; name: string; pendingId?: string } | null, tradeScope?: string | null) => {
    // Cliente só de atacado abre a venda em Atacado (visível e editável na tela). Com itens já lançados, nada muda sozinho.
    const suggested = suggestedTable(tradeScope, tables);
    setDraft((d) => ({ ...d, customer, priceTable: suggested && d.items.length === 0 ? suggested : d.priceTable }));
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
      filters={
        <>
          {mode !== 'conditional' && <Button label="Consumidor final (sem cliente)" variant="outline" onPress={() => choose(null)} />}
          {waiting.map((e) => (
            // Cadastro feito sem conexão: a venda fica guardada e sobe depois que o cliente for criado.
            <ListRow key={e.id} title={e.input.name} lines={['Cadastro aguardando sincronização']} onPress={() => choose({ id: 0, name: e.input.name, pendingId: e.id })} trailing={<StatusPill label="Pendente" tone="primary" />} />
          ))}
        </>
      }
      renderRow={(c) => (
        <ListRow
          title={c.name}
          lines={[c.phone, c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : null].filter((v): v is string => !!v)}
          // Cliente bloqueado não é escolhido: o ComercialWeb recusaria a venda de qualquer forma.
          onPress={c.restrictionBlock ? undefined : () => choose({ id: c.id, name: c.name }, c.tradeScope)}
          trailing={c.restrictionBlock ? <StatusPill label="Bloqueado" tone="danger" /> : undefined}
        />
      )}
    />
  );
}
