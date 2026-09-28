import { Text as RNText, type TextProps } from 'react-native';

import { colors, typography } from '@/shared/theme/tokens';

type Variant = keyof typeof typography;

type Props = TextProps & {
  variant?: Variant;
  color?: keyof typeof colors;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: Props) {
  return <RNText style={[typography[variant], { color: colors[color] }, style]} {...rest} />;
}
