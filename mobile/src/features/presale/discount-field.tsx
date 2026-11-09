import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { discountText, parseDiscount, toggleDiscount, type Discount } from '@/features/presale/draft-model';
import { Text } from '@/shared/components/text';
import { maxFontScale, radius, spacing, touchTarget, typography } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

type Props = {
  label: string;
  value: Discount | undefined;
  onChange: (value: Discount | undefined) => void;
  disabled: boolean;
  // Bruto da linha (ou da venda): base para converter o desconto ao trocar R$ por % (e o contrário).
  grossCents: number;
};

// [%|R$] [valor]: um botão alterna a unidade, como no PDV da web, convertendo o que já foi digitado. Valor válido vale na
// hora; texto inválido mostra o aviso e, ao sair do campo, volta ao último valor bom. O limite real é o do ComercialWeb.
export function DiscountField({ label, value, onChange, disabled, grossCents }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [kind, setKind] = useState<Discount['kind']>(value?.kind ?? 'percent');
  const [text, setText] = useState(discountText(value));
  const [invalid, setInvalid] = useState(false);
  const [focused, setFocused] = useState(false);

  // Valor trocado por fora (conversão, rascunho reaberto): o campo acompanha.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (value) setKind(value.kind);
    if (!focused) setText(discountText(value));
  }

  function change(next: string) {
    setText(next);
    if (next.trim() === '') {
      setInvalid(false);
      onChange(undefined);
      return;
    }
    const parsed = parseDiscount(kind, next);
    setInvalid(parsed === null);
    if (parsed) onChange(parsed);
  }

  function toggle() {
    setKind(kind === 'percent' ? 'value' : 'percent');
    setInvalid(false);
    if (!value) {
      setText('');
      return;
    }
    const converted = toggleDiscount(value, grossCents);
    setText(discountText(converted));
    onChange(converted);
  }

  const unit = kind === 'percent' ? '%' : 'R$';
  return (
    <View style={styles.box}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} em ${kind === 'percent' ? 'percentual' : 'reais'}. Alternar para ${kind === 'percent' ? 'reais' : 'percentual'}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={toggle}
          style={({ pressed }) => [styles.unit, pressed && styles.pressed, disabled && styles.inactive]}
        >
          <Text variant="label" color="onPrimary">
            {unit}
          </Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(discountText(value));
            setInvalid(false);
          }}
          keyboardType="decimal-pad"
          editable={!disabled}
          placeholder={kind === 'percent' ? '0' : '0,00'}
          placeholderTextColor={colors.textMuted}
          maxFontSizeMultiplier={maxFontScale}
          accessibilityLabel={`${label} (${unit})`}
          style={[styles.input, focused && styles.focused, invalid && styles.invalid]}
        />
      </View>
      {invalid && (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {kind === 'percent' ? 'Use de 0,01 a 99,99.' : 'Valor maior que zero.'}
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  unit: {
    minWidth: touchTarget,
    height: touchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.4 },
  input: {
    ...typography.label,
    flex: 1,
    minWidth: 0,
    height: touchTarget,
    textAlign: 'right',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
  focused: { borderColor: colors.primary },
  invalid: { borderColor: colors.danger },
}));
