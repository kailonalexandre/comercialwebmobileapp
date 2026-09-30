import { Pressable, View } from 'react-native';

import { Text } from '@/shared/components/text';
import { radius, shadow, spacing, touchTarget } from '@/shared/theme/tokens';
import { makeStyles } from '@/shared/theme/theme-context';

type Props<K extends string> = { options: { key: K; label: string }[]; selected: K; onSelect: (key: K) => void };

// Controle segmentado: uma faixa só, com o item ativo em destaque (troca de canal, aba).
export function Segmented<K extends string>({ options, selected, onSelect }: Props<K>) {
  const styles = useStyles();
  return (
    <View style={styles.track}>
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(o.key)}
            style={[styles.item, active && styles.active]}
          >
            <Text variant="label" color={active ? 'text' : 'textMuted'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: { flexDirection: 'row', padding: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.chip },
  item: { flex: 1, minHeight: touchTarget - spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.md },
  active: { backgroundColor: colors.background, ...shadow.card },
}));
