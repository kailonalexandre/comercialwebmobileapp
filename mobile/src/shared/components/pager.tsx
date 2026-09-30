import { Pressable, View } from 'react-native';

import { Icon } from '@/shared/components/icon';
import { Text } from '@/shared/components/text';
import { spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles, useTheme } from '@/shared/theme/theme-context';

type Props = {
  page: number;
  totalPages: number;
  total: number;
  failed: boolean;
  // Espaço extra embaixo quando algo (ex.: o botão central da barra de abas) invade a barra.
  bottomGap?: number;
  onPage: (page: number) => void;
  onRetry: () => void;
};

// Barra de paginação numerada: Anterior, "Página X de Y" e Próxima; o total de registros aparece sempre.
export function Pager({ page, totalPages, total, failed, bottomGap = 0, onPage, onRetry }: Props) {
  const styles = useStyles();
  if (total === 0 && !failed) return null;
  return (
    <View style={[styles.bar, { paddingBottom: spacing.sm + bottomGap }]}>
      {failed && (
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text variant="caption" color="danger" style={styles.center}>
            Não foi possível carregar. Toque para tentar de novo.
          </Text>
        </Pressable>
      )}
      <View style={styles.row}>
        <Step label="Página anterior" icon="chevron-back" disabled={page <= 1} onPress={() => onPage(page - 1)} />
        <View style={styles.info}>
          <Text variant="label">
            Página {page} de {totalPages}
          </Text>
          <Text variant="caption" color="textMuted">
            {total === 1 ? '1 registro' : `${total} registros`}
          </Text>
        </View>
        <Step label="Próxima página" icon="chevron-forward" disabled={page >= totalPages} onPress={() => onPage(page + 1)} />
      </View>
    </View>
  );
}

function Step({ label, icon, disabled, onPress }: { label: string; icon: 'chevron-back' | 'chevron-forward'; disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.step, disabled && styles.disabled]}
    >
      <Icon name={icon} size={24} color={colors.primary} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  info: { alignItems: 'center' },
  step: { width: touchTarget, height: touchTarget, borderRadius: touchTarget / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.35 },
  center: { textAlign: 'center' },
}));
