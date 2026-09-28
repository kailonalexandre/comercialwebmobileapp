// Única fonte de valores visuais do app. Telas e componentes não usam valores literais.

export const colors = {
  primary: '#6D3AED',
  primaryPressed: '#5B2BD4',
  primarySoft: '#EFEAFF',
  gradientStart: '#8B5CF6',
  gradientEnd: '#6D3AED',
  onPrimary: '#FFFFFF',

  background: '#FFFFFF',
  surface: '#F8F7FD',
  border: '#E9E5F5',

  text: '#1B1830',
  textMuted: '#6B6782',
  textInverse: '#FFFFFF',
  textInverseMuted: 'rgba(255,255,255,0.82)',

  // Superfícies translúcidas sobre o gradiente roxo.
  overlay: 'rgba(255,255,255,0.12)',
  overlayBorder: 'rgba(255,255,255,0.22)',

  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#E0EAFF',
  accent: '#DB2777',
  accentSoft: '#FCE7F3',
  badge: '#EF4444',
} as const;

// Tons semânticos para ícones e cards tingidos (KPIs, módulos).
export const tones = {
  primary: { fg: colors.primary, bg: colors.primarySoft, tint: '#FBF9FF', border: '#E7DFFD' },
  success: { fg: colors.success, bg: colors.successSoft, tint: '#F5FCF7', border: '#D3F0DC' },
  danger: { fg: colors.danger, bg: colors.dangerSoft, tint: '#FFF8F7', border: '#FBDCDC' },
  info: { fg: colors.info, bg: colors.infoSoft, tint: '#F7F9FF', border: '#DCE5FB' },
  accent: { fg: colors.accent, bg: colors.accentSoft, tint: '#FFF7FB', border: '#F8D9E8' },
} as const;

export type Tone = keyof typeof tones;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// Tamanho mínimo 14 para legibilidade; corpo em 16.
export const typography = {
  display: { fontSize: 34, lineHeight: 42, fontWeight: '700' },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: '600' },
  value: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
} as const;

export const shadow = {
  card: {
    shadowColor: '#1B1830',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#6D3AED',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

// Área de toque mínima recomendada (Material 48dp / Apple 44pt).
export const touchTarget = 48;
