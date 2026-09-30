import { StyleSheet, View } from 'react-native';

import { Text } from '@/shared/components/text';
import { radius, spacing, type Tone } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/theme-context';

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const { tones } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: tones[tone].bg }]}>
      <Text variant="caption" style={{ color: tones[tone].fg }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});
