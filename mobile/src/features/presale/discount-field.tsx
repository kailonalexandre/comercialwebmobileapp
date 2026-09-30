import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { discountText, parseDiscount, type Discount } from '@/features/presale/draft-model';
import { ChipRow } from '@/shared/components/chip-row';
import { Text } from '@/shared/components/text';
import { TextField } from '@/shared/components/text-field';
import { spacing } from '@/shared/theme/tokens';

const KINDS: { key: Discount['kind']; label: string }[] = [
  { key: 'percent', label: '%' },
  { key: 'value', label: 'R$' },
];

type Props = { label: string; value: Discount | undefined; onChange: (value: Discount | undefined) => void; disabled: boolean };

// Percentual OU valor, nunca os dois. Valor válido vale na hora; texto inválido mostra o aviso e, ao sair do campo,
// volta ao último valor bom (mesmo padrão da quantidade). O limite real é o do ComercialWeb, que recusa acima dele.
export function DiscountField({ label, value, onChange, disabled }: Props) {
  const [kind, setKind] = useState<Discount['kind']>(value?.kind ?? 'percent');
  const [text, setText] = useState(discountText(value));
  const [invalid, setInvalid] = useState(false);

  function change(nextText: string, nextKind: Discount['kind'] = kind) {
    setText(nextText);
    if (nextText.trim() === '') {
      setInvalid(false);
      onChange(undefined);
      return;
    }
    const parsed = parseDiscount(nextKind, nextText);
    setInvalid(parsed === null);
    if (parsed) onChange(parsed);
  }

  function restore() {
    setText(discountText(value));
    setInvalid(false);
  }

  return (
    <View style={styles.box}>
      <Text variant="label">{label}</Text>
      <ChipRow
        options={KINDS}
        selected={kind}
        onSelect={(next) => {
          setKind(next);
          if (!disabled) change(text, next);
        }}
      />
      <TextField
        value={text}
        onChangeText={(t) => change(t)}
        onBlur={restore}
        keyboardType="decimal-pad"
        editable={!disabled}
        placeholder={kind === 'percent' ? 'Ex.: 10 ou 10,5' : 'Ex.: 12,50'}
        accessibilityLabel={label}
        error={invalid ? (kind === 'percent' ? 'Use de 0,01 a 99,99.' : 'Informe um valor maior que zero.') : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.sm } });
