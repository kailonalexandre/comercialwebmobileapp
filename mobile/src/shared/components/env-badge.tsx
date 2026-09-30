import { View } from 'react-native';

import { appEnv } from '@/infrastructure/config';
import { Text } from '@/shared/components/text';
import { radius, spacing } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

// Selo visível só no flavor local, para ninguém confundir com produção.
export function EnvBadge() {
  const styles = useStyles();
  if (appEnv.name !== 'local') return null;
  return (
    <View style={styles.pill} accessibilityLabel="Ambiente local">
      <Text variant="caption" color="warning">
        LOCAL
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
}));
