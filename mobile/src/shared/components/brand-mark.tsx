import Svg, { Path } from 'react-native-svg';

import { colors } from '@/shared/theme/tokens';

type Props = { size?: number; color?: string };

// Marca Infinit (mesmo vetor de public/infinit-purple-favicon.svg do ComercialWeb web).
export function BrandMark({ size = 40, color = colors.primary }: Props) {
  return (
    <Svg width={size} height={(size * 42) / 68} viewBox="0 0 68 42" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M14.0307 35.3759C13.8214 35.1665 13.8217 34.827 14.0314 34.618L47.6643 1.10438C47.8727 0.896706 48.2097 0.896103 48.4188 1.10303L53.9959 6.62057C54.2066 6.82908 54.2078 7.16914 53.9986 7.37914L20.4552 41.0418C20.2462 41.2515 19.9067 41.2518 19.6973 41.0425L14.0307 35.3759Z"
        fill={color}
      />
      <Path
        d="M54.6147 7.15234L47.9219 14.1129L53.2762 19.7349L47.9219 25.0892L54.8825 32.0498L64.7098 22.6236C66.493 20.9132 66.4632 18.0529 64.6448 16.38L54.6147 7.15234Z"
        fill={color}
      />
      <Path
        d="M13.3853 34.7915L20.1121 27.8637L14.7854 22.2156L20.1658 16.8875L13.2393 9.89302L3.36601 19.2711C1.5745 20.9728 1.59028 23.8331 3.40047 25.5149L13.3853 34.7915Z"
        fill={color}
      />
    </Svg>
  );
}
