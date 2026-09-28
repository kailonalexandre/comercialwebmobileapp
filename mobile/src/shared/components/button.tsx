import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { colors, radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';

type Variant = 'primary' | 'secondary' | 'outline' | 'inverse';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  trailingIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
};

const foreground: Record<Variant, string> = {
  primary: colors.onPrimary,
  secondary: colors.primary,
  outline: colors.primary,
  inverse: colors.primary,
};

export function Button({ label, onPress, variant = 'primary', icon, trailingIcon, loading = false, disabled = false }: Props) {
  const inactive = disabled || loading;
  const fg = foreground[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, inactive && styles.inactive]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} color={fg} />}
          <Text variant="label" style={[styles.label, { color: fg }]}>
            {label}
          </Text>
          {trailingIcon && <Icon name={trailingIcon} size={20} color={fg} />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget + spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { fontSize: 16 },
  primary: { backgroundColor: colors.primary, ...shadow.raised },
  secondary: { backgroundColor: colors.primarySoft },
  outline: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  inverse: { backgroundColor: colors.background },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.6 },
});
