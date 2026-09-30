import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/shared/components/text';
import { colors, radius, spacing, touchTarget } from '@/shared/theme/tokens';

type Props<K extends string> = { options: { key: K; label: string }[]; selected: K; onSelect: (key: K) => void };

// Filtro de escolha única (um botão por opção).
export function ChipRow<K extends string>({ options, selected, onSelect }: Props<K>) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(o.key)}
            style={[styles.chip, active && styles.active]}
          >
            <Text variant="label" color={active ? 'onPrimary' : 'text'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: touchTarget - spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
});
