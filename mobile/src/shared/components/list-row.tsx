import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/shared/components/text';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';

type Props = { title: string; lines: string[]; trailing?: ReactNode; onPress?: () => void; label?: string };

// Linha padrão de listagem: título, linhas de apoio e um valor/etiqueta à direita.
export function ListRow({ title, lines, trailing, onPress, label }: Props) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label ?? [title, ...lines].join(', ')}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {lines.map((line) => (
          <Text key={line} variant="caption" color="textMuted" numberOfLines={1}>
            {line}
          </Text>
        ))}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
});
