import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { secureStorage } from '@/infrastructure/storage/secure-storage';
import { darkColors, lightColors, makeTones, type Colors } from '@/shared/theme/tokens';

// Preferência do usuário: seguir o sistema ou forçar claro/escuro. Não é dado sensível.
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'cw.theme';

type ThemeValue = {
  colors: Colors;
  tones: ReturnType<typeof makeTones>;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

const isPreference = (v: unknown): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    secureStorage
      .get(KEY)
      .then((saved) => isPreference(saved) && setPreferenceState(saved))
      .catch(() => undefined); // sem leitura: segue o sistema
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    secureStorage.set(KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    const colors = scheme === 'dark' ? darkColors : lightColors;
    return { colors, tones: makeTones(colors), scheme, preference, setPreference };
  }, [preference, system, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme fora de ThemeProvider');
  return value;
}

/**
 * Estilos que dependem do tema: `const useStyles = makeStyles((colors) => ({ ... }))` no módulo e
 * `const styles = useStyles()` no componente. Recalcula só quando o tema muda.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: Colors) => T) {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
