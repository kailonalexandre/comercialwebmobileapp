import { StyleSheet, View } from 'react-native';

import { Text } from '@/shared/components/text';
import { colors, radius, spacing } from '@/shared/theme/tokens';

type Row = { label: string; value: string | null | undefined };

// Cartão de rótulo/valor; linhas sem valor não aparecem.
export function InfoCard({ rows }: { rows: Row[] }) {
  const visible = rows.filter((r): r is { label: string; value: string } => !!r.value);
  if (visible.length === 0) return null;
  return (
    <View style={styles.card}>
      {visible.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text variant="caption" color="textMuted">
            {r.label}
          </Text>
          <Text>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  row: { gap: 2 },
});
