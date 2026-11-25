import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';
import { layout, radius, spacing, touchTarget } from '@/shared/theme/tokens';

export function OrderHeader({ title, subtitle, onBack, action, centered }: {
  title: string; subtitle?: string; onBack?: () => void; action?: ReactNode; centered?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.header, !!subtitle && styles.headerWithSubtitle]}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}>
          <Icon name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      )}
      <View style={[styles.grow, centered && onBack && styles.centered]}>
        <Text accessibilityRole="header" variant={centered ? 'heading' : 'title'} numberOfLines={2} style={centered ? styles.centerText : styles.title}>{title}</Text>
        {subtitle && <Text variant="caption" color="textMuted">{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export function OrderFooter({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: spacing.lg + bottom }]}>
      <View style={styles.footerContent}>{children}</View>
    </View>
  );
}

export function OrderChip({ label, selected, onPress, compact, icon, disabled }: {
  label: string; selected: boolean; onPress: () => void; compact?: boolean; icon?: IconName; disabled?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = selected ? 'onPrimary' : 'text';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.chipHitArea, (pressed || disabled) && styles.dim]}>
      <View style={[styles.chip, compact && styles.compactChip, selected && styles.selected]}>
        {icon && <Icon name={icon} size={16} color={colors[color]} />}
        <Text variant={compact ? 'caption' : 'label'} color={color} style={styles.chipLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  header: { ...layout.content, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, minHeight: 72 },
  headerWithSubtitle: { paddingTop: spacing.xl, paddingBottom: spacing.xs },
  title: { fontSize: 24, lineHeight: 30 },
  grow: { flex: 1 },
  centered: { marginRight: touchTarget + spacing.sm },
  centerText: { textAlign: 'center' },
  back: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  footer: { backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.lg },
  footerContent: { ...layout.content, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chipHitArea: { minHeight: 44, justifyContent: 'center' },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, minHeight: 40, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  chipLabel: { fontSize: 14 },
  compactChip: { minHeight: 28, paddingHorizontal: spacing.md },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dim: { opacity: 0.6 },
}));
