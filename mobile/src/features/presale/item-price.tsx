import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { parseMoney, priceOf, type DraftItem } from '@/features/presale/draft-model';
import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { maxFontScale, radius, spacing, touchTarget, typography } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { formatCents } from '@/shared/utils/format';

type Props = {
  item: DraftItem;
  // Só com pdv.change-price (a API e o ComercialWeb conferem de novo). Sem ela o preço é só leitura.
  editable: boolean;
  onChange: (cents: number | undefined) => void;
};

const asText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

// "R$ 12,00 un." e, para quem pode, o lápis que abre o campo do valor unitário. Valor inválido ou vazio não muda nada.
export function ItemPrice({ item, editable, onChange }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const changed = item.customPriceCents !== undefined;

  function open() {
    setText(asText(priceOf(item)));
    setEditing(true);
  }

  function commit() {
    const cents = parseMoney(text);
    if (cents !== null) onChange(cents);
    setEditing(false);
  }

  if (editing) {
    return (
      <View style={styles.row}>
        <Text variant="caption" color="textMuted">
          R$
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          selectTextOnFocus
          keyboardType="decimal-pad"
          maxFontSizeMultiplier={maxFontScale}
          accessibilityLabel={`Valor unitário de ${item.name}`}
          style={styles.input}
        />
        <Text variant="caption" color="textMuted">
          un.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text variant="caption" color={changed ? 'warning' : 'textMuted'}>
        {formatCents(priceOf(item))} un.{changed ? ` (tabela ${formatCents(item.unitPriceCents)})` : ''}
      </Text>
      {editable && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Alterar valor unitário de ${item.name}`} onPress={open} hitSlop={spacing.sm} style={styles.edit}>
          <Icon name="pencil-outline" size={16} color={colors.primary} />
        </Pressable>
      )}
      {editable && changed && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Voltar ao preço da tabela de ${item.name}`} onPress={() => onChange(undefined)} hitSlop={spacing.sm} style={styles.edit}>
          <Icon name="refresh-outline" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  edit: { width: touchTarget / 2, height: touchTarget / 2, alignItems: 'center', justifyContent: 'center' },
  input: {
    ...typography.label,
    minWidth: 88,
    height: touchTarget - spacing.sm,
    textAlign: 'right',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
}));
