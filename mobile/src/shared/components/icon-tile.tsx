import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/shared/components/icon';
import { radius, type Tone } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/theme-context';

type Props = { icon: IconName; tone?: Tone; size?: number };

// Quadrado tingido com ícone — padrão visual de KPIs, atalhos e módulos.
export function IconTile({ icon, tone = 'primary', size = 44 }: Props) {
  const { tones } = useTheme();
  const t = tones[tone];
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: t.bg }]}>
      <Icon name={icon} size={size * 0.5} color={t.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
