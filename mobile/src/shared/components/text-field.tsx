import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon, type IconName } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { colors, maxFontScale, radius, spacing, touchTarget, typography } from '@/shared/theme/tokens';

type Props = TextInputProps & {
  label?: string;
  icon?: IconName;
  trailing?: ReactNode;
  error?: string;
};

export function TextField({ label, icon, trailing, error, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text variant="label">{label}</Text>}
      <View style={[styles.box, focused && styles.focused, !!error && styles.invalid]}>
        {icon && <Icon name={icon} size={20} color={focused ? colors.primary : colors.textMuted} />}
        <TextInput
          maxFontSizeMultiplier={maxFontScale}
          accessibilityLabel={label ?? rest.placeholder}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  box: {
    minHeight: touchTarget + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  input: { ...typography.body, flex: 1, color: colors.text, paddingVertical: spacing.md },
  focused: { borderColor: colors.primary },
  invalid: { borderColor: colors.danger },
});
