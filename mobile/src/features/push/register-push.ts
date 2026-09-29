import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { canRegister, isExpoPushToken } from '@/features/push/push-token';
import { api } from '@/infrastructure/api';

const PATH = '/v1/me/push-token';

// Registra o aparelho para push. Nunca lança nem bloqueia o login: qualquer impedimento
// (sem projectId, permissão negada, sem Play Services, rede) apenas deixa o push desligado.
export async function registerPush(): Promise<boolean> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!api || !projectId || !Device.isDevice) return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (!canRegister({ projectId, isDevice: Device.isDevice, granted: status === 'granted' })) return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!isExpoPushToken(token)) return false;

    await api.request(PATH, { method: 'PUT', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    return true;
  } catch {
    return false;
  }
}

// Melhor esforço no logout; a API também ignora sessões revogadas.
export async function unregisterPush(): Promise<void> {
  try {
    await api?.request(PATH, { method: 'DELETE' });
  } catch {
    // sem rede: a sessão revogada já para os envios.
  }
}
