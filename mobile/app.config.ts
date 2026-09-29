import type { ConfigContext, ExpoConfig } from 'expo/config';

// Flavor fixado no build por EXPO_PUBLIC_APP_ENV. HTTP em texto claro só existe no flavor local:
// o nativo é gerado aqui (nunca edite android/ ou ios/ à mão). Trocou de flavor? `expo prebuild --clean`.
export default ({ config }: ConfigContext): ExpoConfig => {
  const local = process.env.EXPO_PUBLIC_APP_ENV === 'local';
  return {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(local && { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }),
      },
    },
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: local } }]],
  };
};
