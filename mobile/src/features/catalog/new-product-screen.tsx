import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';

import { createQuickProduct } from '@/features/catalog/products-api';
import { centsFromDigits, emptyProduct, validateProduct, type QuickProductErrors, type QuickProductInput } from '@/features/catalog/quick-product-model';
import { DetailFrame } from '@/features/shell/detail-frame';
import { ApiError } from '@/infrastructure/api/client';
import { Button } from '@/shared/components/button';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { formatCents } from '@/shared/utils/format';

const noop = () => undefined;
const money = (digits: string) => {
  const cents = centsFromDigits(digits);
  return cents === null ? '' : formatCents(cents);
};

// Cadastro rápido de produto (online): nome e preço bastam; SKU vazio vira o código sequencial no ComercialWeb.
export function NewProductScreen() {
  const [input, setInput] = useState<QuickProductInput>(emptyProduct);
  const [errors, setErrors] = useState<QuickProductErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false); // toque repetido em "Salvar" nunca cria dois cadastros
  const key = useRef(randomUUID()); // mesmo envio repetido (timeout) devolve o produto já criado

  const set = (field: keyof QuickProductInput, value: string) => {
    setInput((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFailure(null);
    key.current = randomUUID(); // dado mudou: é outro cadastro
  };

  const save = async () => {
    if (saving.current) return;
    const found = validateProduct(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    saving.current = true;
    setBusy(true);
    try {
      const { id } = await createQuickProduct(input, key.current);
      router.replace({ pathname: '/produto/[id]', params: { id: String(id) } });
    } catch (e) {
      setFailure(e instanceof ApiError && e.serverMessage ? e.serverMessage : e instanceof ApiError && e.kind === 'validation' ? 'SKU ou código de barras já cadastrado, ou dados inválidos.' : 'Não foi possível salvar o produto. Verifique a conexão e tente de novo.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <DetailFrame title="Novo produto" loading={false} failure={null} error={null} notFoundMessage="" onRetry={noop}>
      <TextField label="Nome" value={input.name} onChangeText={(v) => set('name', v)} error={errors.name} autoCapitalize="words" autoFocus returnKeyType="next" />
      <TextField label="Preço de venda" value={money(input.saleCents)} onChangeText={(v) => set('saleCents', v)} error={errors.saleCents} keyboardType="number-pad" placeholder="R$ 0,00" />
      <TextField label="Custo (opcional)" value={money(input.costCents)} onChangeText={(v) => set('costCents', v)} keyboardType="number-pad" placeholder="R$ 0,00" />
      <TextField label="Código de barras (opcional)" value={input.barcode} onChangeText={(v) => set('barcode', v)} keyboardType="number-pad" />
      <TextField label="SKU (opcional)" value={input.sku} onChangeText={(v) => set('sku', v)} autoCapitalize="characters" autoCorrect={false} />
      {failure && (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {failure}
        </Text>
      )}
      <Button label="Salvar" icon="checkmark" loading={busy} onPress={() => void save()} />
    </DetailFrame>
  );
}
