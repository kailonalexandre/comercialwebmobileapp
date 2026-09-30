import type { ConfigContext, ExpoConfig } from 'expo/config';

// Flavor fixado no build por EXPO_PUBLIC_APP_ENV. HTTP em texto claro só existe no flavor local:
// o nativo é gerado aqui (nunca edite android/ ou ios/ à mão). Trocou de flavor? `expo prebuild --clean`.
export default ({ config }: ConfigContext): ExpoConfig => {
  const local = process.env.EXPO_PUBLIC_APP_ENV === 'local';
  // Um .env.local esquecido no ambiente não pode virar build de produção com HTTP liberado.
  if (local && process.env.EAS_BUILD_PROFILE === 'production') {
    throw new Error('EXPO_PUBLIC_APP_ENV=local não é permitido no perfil de build production.');
  }
  // Push (opcional): o arquivo do Firebase e o id do projeto EAS entram por variável, nunca versionados.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const projectId = process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId;
  return {
    ...(config as ExpoConfig),
    ...(projectId && { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } } }),
    android: { ...config.android, ...(googleServicesFile && { googleServicesFile }) },
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
