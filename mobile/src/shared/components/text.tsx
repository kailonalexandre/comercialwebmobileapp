import { Text as RNText, type TextProps } from 'react-native';

import { maxFontScale, typography, type Colors } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/theme-context';

type Variant = keyof typeof typography;

type Props = TextProps & {
  variant?: Variant;
  color?: keyof Colors;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const { colors } = useTheme();
  return <RNText maxFontSizeMultiplier={maxFontScale} style={[typography[variant], { color: colors[color] }, style]} {...rest} />;
}
