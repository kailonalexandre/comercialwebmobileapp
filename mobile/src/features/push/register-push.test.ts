import { Platform } from 'react-native';
import { registerPush, unregisterPush } from '@/features/push/register-push';

const mockRequest = jest.fn();
const mockConstants: { expoConfig: { extra?: { eas?: { projectId?: string } } } } = { expoConfig: {} };
const mockDevice = { isDevice: true };
const mockNotifications = {
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
};

jest.mock('@/infrastructure/api', () => ({ api: { request: (...a: unknown[]) => mockRequest(...a) } }));
jest.mock('expo-constants', () => ({ __esModule: true, get default() { return mockConstants; } }));
jest.mock('expo-device', () => ({ get isDevice() { return mockDevice.isDevice; } }));
jest.mock('expo-notifications', () => ({
  get AndroidImportance() { return mockNotifications.AndroidImportance; },
  setNotificationChannelAsync: (...a: unknown[]) => mockNotifications.setNotificationChannelAsync(...a),
  getPermissionsAsync: () => mockNotifications.getPermissionsAsync(),
  requestPermissionsAsync: () => mockNotifications.requestPermissionsAsync(),
  getExpoPushTokenAsync: (...a: unknown[]) => mockNotifications.getExpoPushTokenAsync(...a),
}));


beforeEach(() => {
  jest.clearAllMocks();
  mockConstants.expoConfig = { extra: { eas: { projectId: 'proj-1' } } };
  mockDevice.isDevice = true;
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  mockRequest.mockResolvedValue(undefined);
});

describe('registerPush', () => {
  it('envia o token com PUT quando tudo está disponível', async () => {
    await expect(registerPush()).resolves.toBe(true);
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(mockRequest).toHaveBeenCalledWith('/v1/me/push-token', {
      method: 'PUT',
      body: { token: 'ExponentPushToken[abc]', platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
  });

  it('sem projectId não faz nada (recurso desligado)', async () => {
    mockConstants.expoConfig = {};
    await expect(registerPush()).resolves.toBe(false);
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('pula em aparelho virtual e com permissão negada', async () => {
    mockDevice.isDevice = false;
    await expect(registerPush()).resolves.toBe(false);
    mockDevice.isDevice = true;
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await expect(registerPush()).resolves.toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('nunca lança: erro do Expo ou da API vira false', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error('sem Play Services'));
    await expect(registerPush()).resolves.toBe(false);
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockRequest.mockRejectedValue(new Error('rede'));
    await expect(registerPush()).resolves.toBe(false);
  });
});

describe('unregisterPush', () => {
  it('chama DELETE e engole falhas', async () => {
    await unregisterPush();
    expect(mockRequest).toHaveBeenCalledWith('/v1/me/push-token', { method: 'DELETE' });
    mockRequest.mockRejectedValue(new Error('rede'));
    await expect(unregisterPush()).resolves.toBeUndefined();
  });
});
