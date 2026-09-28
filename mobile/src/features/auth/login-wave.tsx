import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Text } from '@/shared/components/text';
import { colors, spacing } from '@/shared/theme/tokens';

// Rodapé decorativo da tela de login com nome e versão do app.
export function LoginWave() {
  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={170} viewBox="0 0 400 170" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="back" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.gradientStart} stopOpacity={0.25} />
            <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity={0.4} />
          </LinearGradient>
          <LinearGradient id="front" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.gradientStart} />
            <Stop offset="1" stopColor={colors.gradientEnd} />
          </LinearGradient>
        </Defs>
        <Path d="M0 40 C 90 0, 170 30, 250 60 S 360 50, 400 20 L 400 170 L 0 170 Z" fill="url(#back)" />
        <Path d="M0 60 C 80 20, 160 70, 240 90 S 350 60, 400 50 L 400 170 L 0 170 Z" fill="url(#front)" />
      </Svg>
      <View style={styles.caption}>
        <Text variant="caption" color="textInverseMuted">
          ComercialWeb
        </Text>
        <Text variant="caption" color="textInverseMuted">
          v{Constants.expoConfig?.version ?? '—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 170, justifyContent: 'flex-end' },
  caption: { alignItems: 'center', paddingBottom: spacing.xl },
});
