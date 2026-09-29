import { canRegister, isExpoPushToken } from '@/features/push/push-token';

describe('isExpoPushToken', () => {
  it('aceita os dois formatos do Expo', () => {
    expect(isExpoPushToken('ExponentPushToken[abc-DEF_123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
  });

  it('recusa formato inválido, vazio ou grande demais', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[a b]')).toBe(false);
    expect(isExpoPushToken('fcm-token')).toBe(false);
    expect(isExpoPushToken(`ExponentPushToken[${'a'.repeat(300)}]`)).toBe(false);
  });
});

describe('canRegister', () => {
  it('só registra com projectId, aparelho físico e permissão', () => {
    expect(canRegister({ projectId: 'p', isDevice: true, granted: true })).toBe(true);
    expect(canRegister({ projectId: undefined, isDevice: true, granted: true })).toBe(false);
    expect(canRegister({ projectId: '', isDevice: true, granted: true })).toBe(false);
    expect(canRegister({ projectId: 'p', isDevice: false, granted: true })).toBe(false);
    expect(canRegister({ projectId: 'p', isDevice: true, granted: false })).toBe(false);
  });
});
