import { Pressable, View } from 'react-native';

import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { radius, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

type Props = { label: string; checked: boolean; onChange: (checked: boolean) => void };

export function Checkbox({ label, checked, onChange }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      hitSlop={spacing.sm}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.checked]}>
        {checked && <Icon name="checkmark" size={16} color={colors.onPrimary} />}
      </View>
      <Text>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm / 2,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
}));
