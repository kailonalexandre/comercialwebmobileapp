import * as SecureStore from 'expo-secure-store';

// Keychain (iOS) / Keystore (Android). Somente este dispositivo, somente desbloqueado:
// não migra em backup nem é lido com o aparelho bloqueado.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureStorage = {
  get: (key: string) => SecureStore.getItemAsync(key, options),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, options),
  remove: (key: string) => SecureStore.deleteItemAsync(key, options),
};
