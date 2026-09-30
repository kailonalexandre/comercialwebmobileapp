import { StyleSheet, View } from 'react-native';

import { appEnv } from '@/infrastructure/config';
import { Text } from '@/shared/components/text';
import { colors, radius, spacing } from '@/shared/theme/tokens';

// Selo visível só no flavor local, para ninguém confundir com produção.
export function EnvBadge() {
  if (appEnv.name !== 'local') return null;
  return (
    <View style={styles.pill} accessibilityLabel="Ambiente local">
      <Text variant="caption" color="warning">
        LOCAL
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
