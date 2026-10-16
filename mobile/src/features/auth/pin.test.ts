import { acceptablePin } from '@/features/auth/auth-api';

test('PIN: 6 números, sem repetição nem sequência', () => {
  expect(acceptablePin('482913')).toBe(true);
  for (const weak of ['123456', '654321', '111111', '12345', '12a456', '1234567']) expect(acceptablePin(weak)).toBe(false);
});
