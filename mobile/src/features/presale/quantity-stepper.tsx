import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { parseQuantity, stepQuantity } from '@/features/presale/draft-model';
import { Icon } from '@/shared/components/icon';
import { maxFontScale, radius, spacing, touchTarget, typography } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

type Props = {
  name: string;
  value: number;
  onChange: (quantity: number) => void;
  integer: boolean;
  disabled: boolean;
  // Muda a cada lançamento desta linha: o campo ganha o foco com o número selecionado, pronto para digitar por cima.
  focusSignal?: number;
};

const show = (q: number) => String(q).replace('.', ',');

// [−] [9] [+]. Cada valor válido vale na hora; texto inválido volta ao último valor bom ao sair do campo.
export function QuantityStepper({ name, value, onChange, integer, disabled, focusSignal }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);

  // − e + (ou o lançamento do mesmo produto de novo) mudam o valor por fora do campo.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (parseQuantity(text) !== value) setText(show(value));
  }

  useEffect(() => {
    if (!focusSignal || disabled) return;
    // ponytail: espera a volta da tela de busca terminar; focar durante a transição é ignorado no Android.
    const timer = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, [focusSignal, disabled]);

  const valid = (q: number | null): q is number => q !== null && (!integer || Number.isInteger(q));

  function change(next: string) {
    setText(next);
    const q = parseQuantity(next);
    if (valid(q)) onChange(q);
  }

  function step(delta: 1 | -1) {
    const next = stepQuantity(value, delta);
    if (next !== value) onChange(next);
  }

  const cannotDecrease = disabled || stepQuantity(value, -1) === value;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir quantidade de ${name}`}
        accessibilityState={{ disabled: cannotDecrease }}
        disabled={cannotDecrease}
        onPress={() => step(-1)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, cannotDecrease && styles.inactive]}
      >
        <Icon name="remove" size={22} color={colors.primary} />
      </Pressable>
      <TextInput
        ref={input}
        value={text}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (!valid(parseQuantity(text))) setText(show(value));
        }}
        selectTextOnFocus
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        editable={!disabled}
        maxFontSizeMultiplier={maxFontScale}
        accessibilityLabel={`Quantidade de ${name}`}
        style={[styles.input, focused && styles.focused]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aumentar quantidade de ${name}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => step(1)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.inactive]}
      >
        <Icon name="add" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  button: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  inactive: { opacity: 0.4 },
  input: {
    ...typography.label,
    width: 56,
    height: touchTarget,
    textAlign: 'center',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xs,
  },
  focused: { borderColor: colors.primary },
}));
