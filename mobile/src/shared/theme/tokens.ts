// Única fonte de valores visuais do app. Telas e componentes não usam valores literais.

export const colors = {
  primary: '#6A2DE8',
  primaryPressed: '#5A22CC',
  primarySoft: '#F0EBFE',
  gradientStart: '#7C4DFF',
  gradientEnd: '#6A2DE8',
  onPrimary: '#FFFFFF',

  // `page` é o fundo das telas; `background` é a superfície branca dos cartões e campos.
  page: '#F4F5F8',
  background: '#FFFFFF',
  surface: '#F8F7FD',
  border: '#E6E9F0',
  chip: '#EEF0F4',

  text: '#1C1F26',
  textMuted: '#6D7488',
  textInverse: '#FFFFFF',
  textInverseMuted: 'rgba(255,255,255,0.82)',

  // Superfícies translúcidas sobre o gradiente roxo.
  overlay: 'rgba(255,255,255,0.12)',
  overlayBorder: 'rgba(255,255,255,0.22)',

  success: '#1F8A4C',
  successSoft: '#E3F5EA',
  warning: '#B4561A',
  warningSoft: '#FDF0E4',
  danger: '#C8354A',
  dangerSoft: '#FBE9EC',
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
  warning: { fg: colors.warning, bg: colors.warningSoft, tint: '#FFFAF5', border: '#F6DFC9' },
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

// Famílias carregadas em src/app/_layout.tsx (Inter Tight para texto, IBM Plex Mono para códigos, datas e números de venda).
// Cada peso é uma família própria: no Android `fontWeight` não escolhe o arquivo de uma fonte customizada.
export const fonts = {
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  semibold: 'InterTight_600SemiBold',
  bold: 'InterTight_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

// Tamanho mínimo 14 para legibilidade; corpo em 16.
export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 42 },
  title: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 34 },
  heading: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 26 },
  value: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
  monoSmall: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  // Totais em destaque: rodapé (total) e cartões de valor (hero).
  total: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  hero: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 48 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#1C1F26',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#6A2DE8',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

// Adaptação a telas e fontes: a fonte do sistema escala até este teto (acima disso o layout quebra),
// e em telas largas (tablet, dobrável) o conteúdo fica centralizado com largura limitada.
export const maxFontScale = 1.3;
export const layout = {
  content: { width: '100%', maxWidth: 640, alignSelf: 'center' },
} as const;

// Área de toque mínima recomendada (Material 48dp / Apple 44pt).
export const touchTarget = 48;
