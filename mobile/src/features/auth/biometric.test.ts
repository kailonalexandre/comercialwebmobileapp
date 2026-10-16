import { verifyBiometricKey } from '@/features/auth/biometric';

const mockGet = jest.fn();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: (...args: unknown[]) => mockGet(...args),
}));
jest.mock('expo-local-authentication', () => ({}));

test('biometria do celular trocada invalida a marca: o desbloqueio local deixa de valer', async () => {
  mockGet.mockResolvedValueOnce('1');
  expect(await verifyBiometricKey('b1-u1', 'x')).toBe('ok');
  mockGet.mockResolvedValueOnce(null); // o sistema invalidou a chave
  expect(await verifyBiometricKey('b1-u1', 'x')).toBe('invalidated');
  mockGet.mockRejectedValueOnce(new Error('cancelado'));
  expect(await verifyBiometricKey('b1-u1', 'x')).toBe('cancelled');
});
